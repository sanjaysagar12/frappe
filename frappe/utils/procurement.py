from __future__ import annotations

import json
import os
import re
import smtplib
from email.message import EmailMessage
from typing import Any

import frappe
import requests
from frappe import _
from frappe.utils import validate_email_address

_ENV_LOADED = False


def _get_log_path() -> str:
	log_dir = frappe.get_site_path("private", "logs")
	os.makedirs(log_dir, exist_ok=True)
	return os.path.join(log_dir, "procurement_email_logs.json")


def _read_logs() -> list[dict[str, Any]]:
	path = _get_log_path()
	if not os.path.exists(path):
		return []

	try:
		with open(path, "r", encoding="utf-8") as handle:
			data = json.load(handle)
		return data if isinstance(data, list) else []
	except Exception:
		return []


def _write_logs(logs: list[dict[str, Any]]) -> None:
	path = _get_log_path()
	with open(path, "w", encoding="utf-8") as handle:
		json.dump(logs, handle, indent=2)


def _load_env_if_needed() -> None:
	global _ENV_LOADED
	if _ENV_LOADED:
		return

	for path in _get_env_paths():
		_load_env_file(path)

	_ENV_LOADED = True


def _get_env_paths() -> list[str]:
	paths: list[str] = []
	try:
		site_path = frappe.get_site_path()
	except Exception:
		site_path = None

	if site_path:
		bench_path = os.path.abspath(os.path.join(site_path, ".."))
		paths.append(os.path.join(bench_path, ".env"))
		paths.append(os.path.join(os.path.dirname(bench_path), ".env"))

	return paths


def _load_env_file(path: str) -> None:
	if not os.path.exists(path):
		return

	with open(path, "r", encoding="utf-8") as handle:
		for line in handle:
			line = line.strip()
			if not line or line.startswith("#") or "=" not in line:
				continue
			key, value = line.split("=", 1)
			key = key.strip()
			value = value.strip().strip("\"").strip("'")
			if key and key not in os.environ:
				os.environ[key] = value


def _get_env_value(key: str) -> str:
	_load_env_if_needed()
	value = os.environ.get(key)
	if not value:
		frappe.throw(_("Missing {0} in environment (.env)").format(key))
	return value


def _build_prompt(vendor: dict[str, Any], items: list[dict[str, Any]]) -> str:
	item_lines = []
	for item in items:
		item_lines.append(
			"- {name} ({code}), qty {qty}, delivery {delivery}".format(
				name=item.get("item_name") or item.get("item_code"),
				code=item.get("item_code") or "",
				qty=item.get("qty") or "",
				delivery=item.get("delivery_date") or "",
			)
		)

	items_block = "\n".join(item_lines) if item_lines else "- Items list not provided"
	vendor_name = vendor.get("supplier") or "Supplier"
	vendor_group = vendor.get("supplier_group") or ""

	return (
		"You are drafting a Request for Quotation email.\n"
		"Return JSON ONLY with keys: subject, body.\n"
		"Subject: short, professional.\n"
		"Body: polite, concise, include the items list and ask for price and lead time.\n"
		"Vendor: {vendor_name}\n"
		"Vendor Group: {vendor_group}\n"
		"Items:\n{items_block}\n"
	).format(vendor_name=vendor_name, vendor_group=vendor_group, items_block=items_block)


def _extract_json(text: str) -> dict[str, Any] | None:
	if not text:
		return None

	cleaned = text.strip()
	if cleaned.startswith("```"):
		cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
		cleaned = re.sub(r"\n```$", "", cleaned)

	try:
		return json.loads(cleaned)
	except Exception:
		return None


def _generate_draft(api_key: str, vendor: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, str]:
	fallback_subject = "Request for Quotation"
	fallback_body = (
		"Dear {vendor},\n\n"
		"We are interested in procuring the following items:\n"
		"{items}\n\n"
		"Please share your best pricing and lead times.\n\n"
		"Regards,\nProcurement Department"
	).format(
		vendor=vendor.get("supplier") or "Supplier",
		items="\n".join(
			"- {name} ({qty})".format(name=i.get("item_name") or i.get("item_code"), qty=i.get("qty") or "")
			for i in items
		)
		or "- Items list not provided",
	)

	prompt = _build_prompt(vendor, items)
	url = (
		"https://generativelanguage.googleapis.com/v1beta/models/"
		"gemini-1.5-flash:generateContent?key={0}".format(api_key)
	)
	payload = {
		"contents": [{"role": "user", "parts": [{"text": prompt}]}],
		"generationConfig": {"temperature": 0.6, "maxOutputTokens": 512},
	}

	try:
		response = requests.post(url, json=payload, timeout=20)
		response.raise_for_status()
		data = response.json()
		text = (
			data.get("candidates", [{}])[0]
			.get("content", {})
			.get("parts", [{}])[0]
			.get("text", "")
		)
		draft = _extract_json(text) or {}
	except Exception:
		draft = {}

	return {
		"subject": draft.get("subject") or fallback_subject,
		"body": draft.get("body") or fallback_body,
	}


@frappe.whitelist()
def generate_rfq_drafts(final_data: Any) -> dict[str, list[dict[str, str]]]:
	print("Generating RFQ drafts using Gemini API...")
	data = frappe.parse_json(final_data) or {}
	items = data.get("items") or []
	vendors = data.get("vendors") or []

	api_key = _get_env_value("GEMINI_API_KEY")

	drafts = []
	for vendor in vendors:
		draft = _generate_draft(api_key, vendor, items)
		drafts.append(
			{
				"supplier": vendor.get("supplier"),
				"email": vendor.get("email"),
				"subject": draft.get("subject"),
				"body": draft.get("body"),
			}
		)

	return {"drafts": drafts}


@frappe.whitelist()
def send_rfq_emails(emails: Any, items: Any = None) -> dict[str, list[dict[str, str]]]:
	payload = frappe.parse_json(emails) or []
	items_payload = frappe.parse_json(items) if items is not None else []

	if isinstance(payload, dict):
		emails = payload.get("emails") or []
		items_payload = payload.get("items") or items_payload
	else:
		emails = payload

	items = items_payload or []

	sender = _get_env_value("EMAIL")
	password = _get_env_value("APP_PASSWORD")

	sent: list[dict[str, str]] = []
	failed: list[dict[str, str]] = []

	if not emails:
		return {"sent": sent, "failed": failed}

	try:
		smtp = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20)
		smtp.login(sender, password)
	except Exception:
		frappe.throw(_("Unable to connect to SMTP with provided credentials"))

	logs = _read_logs()
	items_snapshot = items if isinstance(items, list) else []

	with smtp:
		for email in emails:
			recipient = (email or {}).get("email")
			if not recipient:
				failed.append({"supplier": (email or {}).get("supplier") or "", "email": ""})
				logs.append(
					{
						"timestamp": frappe.utils.now(),
						"supplier": (email or {}).get("supplier") or "",
						"email": "",
						"subject": (email or {}).get("subject") or "",
						"items": items_snapshot,
						"status": "failed",
						"reason": "Missing email"
					}
				)
				continue

			try:
				validate_email_address(recipient, throw=True)
			except Exception:
				failed.append({"supplier": (email or {}).get("supplier") or "", "email": recipient})
				logs.append(
					{
						"timestamp": frappe.utils.now(),
						"supplier": (email or {}).get("supplier") or "",
						"email": recipient,
						"subject": (email or {}).get("subject") or "",
						"items": items_snapshot,
						"status": "failed",
						"reason": "Invalid email"
					}
				)
				continue

			message = EmailMessage()
			message["From"] = sender
			message["To"] = recipient
			message["Subject"] = (email or {}).get("subject") or "Request for Quotation"
			message.set_content((email or {}).get("body") or "")

			try:
				smtp.send_message(message)
				sent.append({"supplier": (email or {}).get("supplier") or "", "email": recipient})
				logs.append(
					{
						"timestamp": frappe.utils.now(),
						"supplier": (email or {}).get("supplier") or "",
						"email": recipient,
						"subject": (email or {}).get("subject") or "",
						"items": items_snapshot,
						"status": "sent",
						"reason": ""
					}
				)
			except Exception:
				failed.append({"supplier": (email or {}).get("supplier") or "", "email": recipient})
				logs.append(
					{
						"timestamp": frappe.utils.now(),
						"supplier": (email or {}).get("supplier") or "",
						"email": recipient,
						"subject": (email or {}).get("subject") or "",
						"items": items_snapshot,
						"status": "failed",
						"reason": "SMTP send failed"
					}
				)

	_write_logs(logs)
	return {"sent": sent, "failed": failed}


@frappe.whitelist()
def get_rfq_email_logs(limit: int = 50) -> dict[str, list[dict[str, Any]]]:
	logs = _read_logs()
	if limit:
		logs = logs[-int(limit):]
	return {"logs": logs}

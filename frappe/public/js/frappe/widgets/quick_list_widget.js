import Widget from "./base_widget.js";

frappe.provide("frappe.utils");

export default class QuickListWidget extends Widget {
	constructor(opts) {
		opts.shadow = true;
		super(opts);
		if (!frappe.procurement_selection) {
			frappe.procurement_selection = {
				'Item': [],
				'Supplier': []
			};
			frappe.procurement_cache = {
				'Item': {},
				'Supplier': {}
			};
		}
	}

	get_config() {
		return {
			document_type: this.document_type,
			label: this.label,
			quick_list_filter: this.quick_list_filter,
		};
	}

	set_actions() {
		if (this.in_customize_mode) return;

		if (frappe.model.can_create(this.document_type)) {
			this.setup_add_new_button();
		}
		this.setup_refresh_list_button();
		this.setup_filter_list_button();
		this.setup_continue_button();
	}

	setup_add_new_button() {
		this.add_new_button = $(
			`<div class="add-new btn btn-xs pull-right"
			title="${__("Add New")} ${__(this.document_type)}
			">
				${frappe.utils.icon("add", "sm")}
			</div>`
		);

		this.add_new_button.appendTo(this.action_area);
		this.add_new_button.on("click", () => {
			frappe.set_route(
				frappe.utils.generate_route({
					type: "doctype",
					name: this.document_type,
					doc_view: "New",
				})
			);
		});
	}

	setup_refresh_list_button() {
		this.refresh_list = $(
			`<div class="refresh-list btn btn-xs pull-right" title="${__("Refresh List")}">
				${frappe.utils.icon("es-line-reload", "sm")}
			</div>`
		);

		this.refresh_list.appendTo(this.action_area);
		this.refresh_list.on("click", () => {
			this.body.empty();
			this.set_body();
		});
	}

	setup_filter_list_button() {
		this.filter_list = $(
			`<div class="filter-list btn btn-xs pull-right" title="${__("Add/Update Filter")}">
				${frappe.utils.icon("filter", "sm")}
			</div>`
		);

		this.filter_list.appendTo(this.action_area);
		this.filter_list.on("click", () => this.setup_filter_dialog());
	}

	setup_bulk_action_button() {
		// Placeholder for backward compatibility if needed, though removed logic
	}

	setup_continue_button() {
		this.continue_btn = $(
			`<div class="continue-btn btn btn-xs btn-primary pull-right hidden" style="margin-right: 5px;">
				${__("Continue")}
			</div>`
		);

		this.continue_btn.appendTo(this.action_area);
		this.continue_btn.on("click", () => {
			this.show_procurement_dialog();
		});
	}

	show_procurement_dialog() {
		const selected_items = frappe.procurement_selection['Item'] || [];
		const selected_vendors = frappe.procurement_selection['Supplier'] || [];
		
		if (selected_items.length === 0) {
			frappe.msgprint(__("Please select at least one Item."));
			return;
		}

		let fields = [];
		selected_items.forEach((item_id, index) => {
			const cache = frappe.procurement_cache['Item'][item_id] || {};
			const item_name = cache.item_name || item_id;

			fields.push({
				label: __("Item: {0}", [item_name]),
				fieldtype: "Section Break",
			});

			// Column 1
			fields.push({
				label: __("Quantity"),
				fieldname: `qty_${index}`,
				fieldtype: "Float",
				default: 1.0,
				reqd: 1
			});
			fields.push({
				label: __("Budget"),
				fieldname: `budget_${index}`,
				fieldtype: "Currency"
			});
			fields.push({
				label: __("Location"),
				fieldname: `location_${index}`,
				fieldtype: "Data"
			});
			fields.push({
				label: __("Importance"),
				fieldname: `importance_${index}`,
				fieldtype: "Select",
				options: "Low\nMedium\nHigh\nUrgent",
				default: "Medium"
			});
			fields.push({
				label: __("Submitting Deadline"),
				fieldname: `deadline_${index}`,
				fieldtype: "Date"
			});
			fields.push({
				label: __("Description"),
				fieldname: `desc_${index}`,
				fieldtype: "Small Text"
			});

			// Column 2
			fields.push({
				fieldtype: "Column Break"
			});
			fields.push({
				label: __("Delivery Date"),
				fieldname: `date_${index}`,
				fieldtype: "Date",
				default: frappe.datetime.nowdate(),
				reqd: 1
			});
			fields.push({
				label: __("Spec"),
				fieldname: `spec_${index}`,
				fieldtype: "Data"
			});
			fields.push({
				label: __("Packaging Requirements"),
				fieldname: `packaging_${index}`,
				fieldtype: "Data"
			});
			fields.push({
				label: __("Required Docs"),
				fieldname: `docs_${index}`,
				fieldtype: "Data"
			});
			fields.push({
				label: __("Payment Terms"),
				fieldname: `payment_${index}`,
				fieldtype: "Data"
			});
			fields.push({
				label: __("Terms and Conditions"),
				fieldname: `terms_${index}`,
				fieldtype: "Small Text"
			});
		});

		const d = new frappe.ui.Dialog({
			title: __("Procurement Details"),
			fields: fields,
			primary_action_label: __("Submit"),
			primary_action: (values) => {
				const final_data = {
					items: selected_items.map((id, i) => {
						const cache = frappe.procurement_cache['Item'][id] || {};
						return {
							item_code: id,
							item_name: cache.item_name || id,
							item_group: cache.item_group || "",
							qty: values[`qty_${i}`],
							budget: values[`budget_${i}`],
							location: values[`location_${i}`],
							importance: values[`importance_${i}`],
							submitting_deadline: values[`deadline_${i}`],
							delivery_date: values[`date_${i}`],
							spec: values[`spec_${i}`],
							packaging_requirements: values[`packaging_${i}`],
							required_docs: values[`docs_${i}`],
							payment_terms: values[`payment_${i}`],
							terms_and_conditions: values[`terms_${i}`],
							description: values[`desc_${i}`]
						};
					}),
					vendors: selected_vendors.map(id => {
						const cache = frappe.procurement_cache['Supplier'][id] || {};
						return {
							supplier: id,
							email: cache.email_id || "",
							supplier_group: cache.supplier_group || ""
						};
					})
				};
				
				console.log("FINAL PROCUREMENT DATA:", final_data);
				d.hide();
				this.show_summary_dialog(final_data);
			}
		});

		d.show();
	}

	show_summary_dialog(final_data) {
		let message_html = "<h4>Step 1: Review Data</h4><div style='overflow-x: auto;'><table class='table table-bordered table-hover' style='font-size: 11px; white-space: nowrap;'>";
		message_html += "<thead><tr><th>Item</th><th>Qty</th><th>Budget</th><th>Location</th><th>Importance</th><th>Deadline</th><th>Del. Date</th><th>Spec</th><th>Pkg Req</th><th>Docs</th><th>Payment Terms</th><th>Terms & Cond</th><th>Desc</th></tr></thead><tbody>";
		final_data.items.forEach(item => {
			message_html += `<tr>
				<td><b>${item.item_name}</b><br><small>${item.item_code}</small></td>
				<td>${item.qty || ""}</td>
				<td>${item.budget || ""}</td>
				<td>${item.location || ""}</td>
				<td>${item.importance || ""}</td>
				<td>${item.submitting_deadline || ""}</td>
				<td>${item.delivery_date || ""}</td>
				<td>${item.spec || ""}</td>
				<td>${item.packaging_requirements || ""}</td>
				<td>${item.required_docs || ""}</td>
				<td>${item.payment_terms || ""}</td>
				<td>${item.terms_and_conditions || ""}</td>
				<td>${item.description || ""}</td>
			</tr>`;
		});
		message_html += "</tbody></table></div>";

		if (final_data.vendors.length > 0) {
			message_html += "<h4 style='margin-top: 15px;'>Selected Vendors</h4><div style='overflow-x: auto;'><table class='table table-bordered table-hover' style='font-size: 11px;'>";
			message_html += "<thead><tr><th>Supplier Name</th><th>Email</th></tr></thead><tbody>";
			final_data.vendors.forEach(v => {
				message_html += `<tr><td><b>${v.supplier}</b></td><td>${v.email || "N/A"}</td></tr>`;
			});
			message_html += "</tbody></table></div>";
		}

		const summary_dialog = new frappe.ui.Dialog({
			title: __("Selection Summary"),
			fields: [{ fieldtype: "HTML", fieldname: "summary_html", options: message_html }],
			primary_action_label: __("Continue to Compose Emails"),
			primary_action: () => {
				summary_dialog.hide();
				this.show_email_review_dialog(final_data);
			}
		});

		summary_dialog.show();
	}

	show_email_review_dialog(final_data) {
		frappe.call({
			method: "frappe.utils.procurement.generate_rfq_drafts",
			args: { final_data },
			freeze: true,
			freeze_message: __("Generating drafts..."),
			callback: (r) => {
				const drafts = r.message?.drafts || [];
				if (!drafts.length) {
					frappe.msgprint({
						title: __("Draft generation failed"),
						message: __("No drafts were returned. Please try again."),
						indicator: "red"
					});
					return;
				}
				this.open_email_review_dialog(final_data, drafts);
			},
			error: () => {
				frappe.msgprint({
					title: __("Draft generation failed"),
					message: __("Unable to generate drafts. Please try again."),
					indicator: "red"
				});
			}
		});
	}

	get_fallback_rfq_drafts(final_data) {
		const item_list_str = final_data.items.map(i => `- ${i.item_name} (${i.qty} units)`).join("\n");
		return final_data.vendors.map((vendor) => {
			const subject = `Request for Quotation - ${final_data.items.length} Items`;
			const body = `Dear ${vendor.supplier},\n\nWe are interested in procuring the following items:\n\n${item_list_str}\n\nPlease provide your best pricing and lead times by return email.\n\nRegards,\nProcurement Department`;

			return {
				supplier: vendor.supplier,
				email: vendor.email,
				subject,
				body
			};
		});
	}

	open_email_review_dialog(final_data, drafts) {
		let email_fields = [];

		drafts.forEach((draft, index) => {
			email_fields.push({
				label: __("Draft for: {0}", [draft.supplier || __("Supplier")]),
				fieldtype: "Section Break"
			});
			email_fields.push({
				label: __("Subject"),
				fieldname: `subject_${index}`,
				fieldtype: "Data",
				default: draft.subject
			});
			email_fields.push({
				label: __("Body"),
				fieldname: `body_${index}`,
				fieldtype: "Small Text",
				default: draft.body
			});
		});

		const email_dialog = new frappe.ui.Dialog({
			title: __("Step 2: Review & Send Emails"),
			fields: email_fields,
			primary_action_label: __("Send To All Vendors"),
			primary_action: (values) => {
				const emails = drafts.map((draft, index) => ({
					supplier: draft.supplier,
					email: draft.email,
					subject: values[`subject_${index}`],
					body: values[`body_${index}`]
				}));

				frappe.call({
					method: "frappe.utils.procurement.send_rfq_emails",
					args: { emails, items: final_data.items || [] },
					freeze: true,
					freeze_message: __("Sending emails..."),
					callback: (r) => {
						const sent = r.message?.sent || [];
						const failed = r.message?.failed || [];

						if (sent.length) {
							frappe.show_alert({
								message: __("Emails sent successfully to {0} vendors!", [sent.length]),
								indicator: "green"
							});
							// Reset selection
							frappe.procurement_selection = { 'Item': [], 'Supplier': [] };
							$(".continue-btn").trigger("update-visibility");
						}

						if (failed.length) {
							const failed_list = failed
								.map((f) => `<li>${frappe.utils.escape_html(f.supplier || "")}: ${frappe.utils.escape_html(f.email || "")}</li>`)
								.join("");
							frappe.msgprint({
								title: __("Some emails failed"),
								message: `<ul>${failed_list}</ul>`,
								indicator: "orange"
							});
						}

						email_dialog.hide();
						this.render_email_logs();
					},
					error: () => {
						frappe.msgprint({
							title: __("Email send failed"),
							message: __("Unable to send emails. Please check your SMTP settings."),
							indicator: "red"
						});
					}
				});
			}
		});

		email_dialog.show();
	}

	render_email_logs() {
		if (this.document_type !== "Supplier") return;

		if (this.email_log_container) {
			this.email_log_container.remove();
		}

		this.email_log_container = $(
			`<div class="email-log-section" style="margin-top: 12px;">
				<div style="font-weight: 600; margin-bottom: 6px;">${__("Email Logs")}</div>
				<div class="email-log-content text-muted">${__("Loading logs...")}</div>
			</div>`
		);

		this.email_log_container.appendTo(this.body);

		frappe.call({
			method: "frappe.utils.procurement.get_rfq_email_logs",
			args: { limit: 50 },
			callback: (r) => {
				const logs = (r.message?.logs || []).slice().reverse();
				const $content = this.email_log_container.find(".email-log-content");

				if (!logs.length) {
					$content.text(__("No email logs yet."));
					return;
				}

				let rows = logs.map((log) => {
					const supplier = frappe.utils.escape_html(log.supplier || "");
					const email = frappe.utils.escape_html(log.email || "");
					const subject = frappe.utils.escape_html(log.subject || "");
					const status = frappe.utils.escape_html(log.status || "");
					const timestamp = frappe.utils.escape_html(log.timestamp || "");
					const item_count = Array.isArray(log.items) ? log.items.length : 0;
					return `<tr>
						<td>${timestamp}</td>
						<td>${supplier}</td>
						<td>${email}</td>
						<td>${subject}</td>
						<td>${item_count}</td>
						<td>${status}</td>
					</tr>`;
				}).join("");

				$content.html(
					`<div style="overflow-x: auto;">
						<table class="table table-bordered table-hover" style="font-size: 11px;">
							<thead>
								<tr>
									<th>${__("Time")}</th>
									<th>${__("Supplier")}</th>
									<th>${__("Email")}</th>
									<th>${__("Subject")}</th>
									<th>${__("Items")}</th>
									<th>${__("Status")}</th>
								</tr>
							</thead>
							<tbody>${rows}</tbody>
						</table>
					</div>`
				);
			},
			error: () => {
				const $content = this.email_log_container.find(".email-log-content");
				$content.text(__("Unable to load logs."));
			}
		});
	}


	setup_filter(doctype) {
		if (this.filter_group) {
			this.filter_group.wrapper.empty();
			delete this.filter_group;
		}

		this.filters = frappe.utils.process_filter_expression(this.quick_list_filter);

		this.filter_group = new frappe.ui.FilterGroup({
			parent: this.dialog.get_field("filter_area").$wrapper,
			doctype: doctype,
			on_change: () => {},
		});

		frappe.model.with_doctype(doctype, () => {
			this.filter_group.add_filters_to_filter_group(this.filters);
			this.dialog.set_df_property("filter_area", "hidden", false);
		});
	}

	setup_filter_dialog() {
		let fields = [
			{
				fieldtype: "HTML",
				fieldname: "filter_area",
			},
		];
		let me = this;
		this.dialog = new frappe.ui.Dialog({
			title: __("Set Filters for {0}", [__(this.document_type)]),
			fields: fields,
			primary_action: function () {
				let old_filter = me.quick_list_filter;
				let filters = me.filter_group.get_filters();
				me.quick_list_filter = JSON.stringify(filters);

				this.hide();

				if (old_filter != me.quick_list_filter) {
					me.body.empty();
					me.set_footer();
					me.set_body();
				}
			},
			primary_action_label: __("Save"),
		});

		this.dialog.show();
		this.setup_filter(this.document_type);
	}

	render_loading_state() {
		this.body.empty();
		this.loading = $(`<div class="list-loading-state text-muted">${__("Loading...")}</div>`);
		this.loading.appendTo(this.body);
	}

	render_no_data_state() {
		this.loading = $(`<div class="list-no-data-state text-muted">${__("No Data...")}</div>`);
		this.loading.appendTo(this.body);
	}

	setup_quick_list_item(doc) {
		const indicator = frappe.get_indicator(doc, this.document_type);

		let $quick_list_item = $(`
			<div class="quick-list-item" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer;">
				<input type="checkbox" class="quick-list-checkbox" style="margin-right: 12px; cursor: pointer; width: 16px; height: 16px;">
				<div class="ellipsis left" style="flex: 1;">
					<div class="ellipsis title"
						style="font-weight: 500;"
						title="${strip_html(doc[this.title_field_name])}">
						${strip_html(doc[this.title_field_name])}
					</div>
					<div class="timestamp text-muted" style="font-size: var(--text-xs);">
						${frappe.datetime.prettyDate(doc.modified)}
					</div>
					<div class="extra-info text-muted" style="font-size: var(--text-xs); margin-top: 2px;">
						${this.get_extra_info(doc)}
					</div>
				</div>
			</div>
		`);

		if (indicator) {
			$(`
				<div class="status indicator-pill ${indicator[1]} ellipsis" style="margin-left: 10px;">
					${indicator[0]}
				</div>
			`).appendTo($quick_list_item);
		}
		let icon_to_append = `<div class="right-arrow" style="margin-left: 10px;">${frappe.utils.icon("right", "xs")}</div>`;
		if (frappe.utils.is_rtl(frappe.boot.lang)) {
			icon_to_append = `<div class="left-arrow" style="margin-right: 10px;">${frappe.utils.icon("left", "xs")}</div>`;
		}
		$(icon_to_append).appendTo($quick_list_item);

		const $checkbox = $quick_list_item.find(".quick-list-checkbox");
		
		$checkbox.on("click", (e) => {
			e.stopPropagation();
			const checked = $checkbox.prop("checked");
			const type = this.document_type === "Supplier" ? "Supplier" : "Item";
			
			if (checked) {
				if (!frappe.procurement_selection[type].includes(doc.name)) {
					frappe.procurement_selection[type].push(doc.name);
				}
			} else {
				frappe.procurement_selection[type] = frappe.procurement_selection[type].filter(id => id !== doc.name);
			}
			$(".continue-btn").trigger("update-visibility");
		});

		// Add listener for global visibility update
		this.continue_btn.on("update-visibility", () => this.update_continue_visibility());

		$quick_list_item.on("click", (e) => {
			if ($(e.target).hasClass("quick-list-checkbox")) return;
			if (e.ctrlKey || e.metaKey) {
				frappe.open_in_new_tab = true;
			}
			frappe.set_route(`${frappe.utils.get_form_link(this.document_type, doc.name)}`);
		});

		return $quick_list_item;
	}

	set_body() {
		this.widget.addClass("quick-list-widget-box");

		this.render_loading_state();

		frappe.model.with_doctype(this.document_type, () => {
			let fields = ["name"];

			// get name of title field
			if (!this.title_field_name) {
				let meta = frappe.get_meta(this.document_type);
				this.title_field_name = (meta && meta.title_field) || "name";
			}

			if (this.title_field_name && this.title_field_name != "name") {
				fields.push(this.title_field_name);
			}

			// check doctype has status field
			this.has_status_field = frappe.meta.has_field(this.document_type, "status");

			if (this.has_status_field) {
				fields.push("status");
				fields.push("docstatus");
			}
			// add workflow state field if workflow exist & is active
			let workflow_fieldname = frappe.workflow.get_state_fieldname(this.document_type);
			workflow_fieldname && fields.push(workflow_fieldname);
			fields.push("modified");

			if (this.document_type === "Supplier") {
				fields.push("email_id");
				fields.push("supplier_group");
			} else if (this.document_type === "Item") {
				fields.push("item_group");
			}

			let add_fields = frappe.listview_settings?.[this.document_type]?.add_fields;
			if (Array.isArray(add_fields)) {
				fields.push(...add_fields);
				fields = [...new Set(fields)];
			}

			let quick_list_filter = frappe.utils.process_filter_expression(this.quick_list_filter);

			let args = {
				method: "frappe.desk.reportview.get",
				args: {
					doctype: this.document_type,
					fields: fields,
					filters: quick_list_filter,
					order_by: "modified desc",
					start: 0,
					page_length: 50,
				},
			};

			frappe.call(args).then((r) => {
				if (!r.message) return;
				let data = r.message;

				this.body.empty();
				data = !Array.isArray(data) ? frappe.utils.dict(data.keys, data.values) : data;

				if (!data.length) {
					this.render_no_data_state();
					this.render_email_logs();
					return;
				}

				// Cache the full data for the wizard
				data.forEach(d => {
					frappe.procurement_cache[this.document_type][d.name] = d;
				});

				this.quick_list = data.map((doc) => this.setup_quick_list_item(doc));
				this.quick_list.forEach(($quick_list_item) =>
					$quick_list_item.appendTo(this.body)
				);
				this.render_email_logs();
			});
		});
	}

	set_footer() {
		this.footer.empty();

		let filters = frappe.utils.get_filter_from_json(this.quick_list_filter);
		let route = frappe.utils.generate_route({ type: "doctype", name: this.document_type });
		this.see_all_button = $(`
			<div class="see-all btn btn-xs">${__("View List")}</div>
		`).appendTo(this.footer);

		this.see_all_button.click((e) => {
			if (e.ctrlKey || e.metaKey) {
				frappe.open_in_new_tab = true;
			}
			if (filters) {
				frappe.route_options = filters;
			}
			frappe.set_route(route);
		});
	}

	update_continue_visibility() {
		const item_count = (frappe.procurement_selection['Item'] || []).length;
		const vendor_count = (frappe.procurement_selection['Supplier'] || []).length;
		const total = item_count + vendor_count;

		if (total > 0) {
			this.continue_btn.removeClass("hidden");
			this.continue_btn.text(`${__("Continue")} (${total})`);
		} else {
			this.continue_btn.addClass("hidden");
		}
	}

	get_extra_info(doc) {
		let info = [];
		if (this.document_type === "Supplier") {
			if (doc.email_id) info.push(doc.email_id);
			if (doc.supplier_group) info.push(`Group: ${doc.supplier_group}`);
		} else if (this.document_type === "Item") {
			if (doc.item_group) info.push(`Group: ${doc.item_group}`);
		}
		return info.join(" | ");
	}
}

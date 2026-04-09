import frappe
import json

@frappe.whitelist()
def make():
	try:
		if frappe.db.exists("Workspace", "Procurement"):
			w = frappe.get_doc("Workspace", "Procurement")
		else:
			w = frappe.new_doc("Workspace")

		w.label = "Procurement"
		w.title = "Procurement"
		w.module = "Buying"
		w.public = 1
		w.is_standard = 0
		w.sequence_id = 99
		
		content = [
			{
				"id": "Pq12Xs",
				"type": "header",
				"data": {
					"text": "Items Quick List",
					"level": 4,
					"col": 12
				}
			},
			{
				"id": "qL1x2u",
				"type": "quick_list",
				"data": {
					"quick_list_name": "All Items",
					"col": 12
				}
			},
			{
				"id": "SupHeader",
				"type": "header",
				"data": {
					"text": "Vendors Quick List",
					"level": 4,
					"col": 12
				}
			},
			{
				"id": "SupList",
				"type": "quick_list",
				"data": {
					"quick_list_name": "All Vendors",
					"col": 12
				}
			}
		]
		w.content = json.dumps(content)
		
		# Set child table for v14 compatibility
		w.set("quick_lists", [])
		w.append("quick_lists", {
			"document_type": "Item",
			"label": "All Items",
			"quick_list_filter": "[]"
		})
		w.append("quick_lists", {
			"document_type": "Supplier",
			"label": "All Vendors",
			"quick_list_filter": "[]"
		})

		w.save(ignore_permissions=True)
		frappe.db.commit()
		print("Workspace 'Procurement' updated successfully with inline Items list!")
	except Exception as e:
		import traceback
		traceback.print_exc()
		print(f"Error: {e}")

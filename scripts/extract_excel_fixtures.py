#!/usr/bin/env python3
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Plan Prod mayo 2026.xlsx"
OUTPUT = ROOT / "tests" / "fixtures" / "excel-plan-prod-mayo-2026.json"
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def split_ref(ref):
    match = re.match(r"([A-Z]+)(\d+)", ref)
    return match.group(1), int(match.group(2))


def cell_text(cell, shared):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(text.text or "" for text in cell.findall(".//main:t", NS))

    value_node = cell.find("main:v", NS)
    value = value_node.text if value_node is not None and value_node.text is not None else ""
    if cell_type == "s" and value.isdigit():
        return shared[int(value)]
    return value


def number(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def sheet_rows(zip_file, workbook_root, relmap, shared, sheet_name):
    sheet = next(sheet for sheet in workbook_root.findall("main:sheets/main:sheet", NS) if sheet.attrib["name"] == sheet_name)
    target = relmap[sheet.attrib[f"{{{NS['rel']}}}id"]]
    target_path = target.lstrip("/")
    if not target_path.startswith("xl/"):
        target_path = "xl/" + target_path
    root = ET.fromstring(zip_file.read(target_path))
    rows = {}
    for row in root.findall("main:sheetData/main:row", NS):
        row_index = int(row.attrib["r"])
        rows[row_index] = {}
        for cell in row.findall("main:c", NS):
            column, _ = split_ref(cell.attrib["r"])
            rows[row_index][column] = cell_text(cell, shared)
    return rows


def completion_from_cell(value):
    return 100 if str(value).strip().lower() == "x" else 0


def main():
    if not WORKBOOK.exists():
        raise SystemExit(f"Workbook not found: {WORKBOOK}")

    with zipfile.ZipFile(WORKBOOK) as zip_file:
        workbook_root = ET.fromstring(zip_file.read("xl/workbook.xml"))
        rels_root = ET.fromstring(zip_file.read("xl/_rels/workbook.xml.rels"))
        relmap = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_root}
        if "xl/sharedStrings.xml" in zip_file.namelist():
            shared_root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
            shared = [
                "".join(text.text or "" for text in item.iter(f"{{{NS['main']}}}t"))
                for item in shared_root.findall("main:si", NS)
            ]
        else:
            shared = []

        plan = sheet_rows(zip_file, workbook_root, relmap, shared, "plan de producción")
        labor = sheet_rows(zip_file, workbook_root, relmap, shared, "Mano de obra")
        prices = sheet_rows(zip_file, workbook_root, relmap, shared, "Precios y materiales ")

    settings = {
        "laborFactor": number(plan[3].get("AA")),
        "hourlyCostPerWorkerCop": number(labor[9].get("C")),
        "activeWorkersCount": int(number(labor[23].get("F")) or 9),
        "dailyHoursMonFri": 9,
        "dailyHoursSat": 6,
        "dailyHoursSun": 0,
        "clientBufferDays": 3,
    }

    workers = []
    for row_index in range(9, 18):
        row = labor.get(row_index, {})
        name = (row.get("E") or "").strip()
        role = (row.get("F") or "").strip()
        hourly = number(row.get("K"))
        if not name:
            continue
        workers.append(
            {
                "displayOrder": int(number(row.get("D")) or 0),
                "fullName": name,
                "role": role or "Operario",
                "hourlyCostCop": hourly or 0,
            }
        )

    rows = []
    for row_index in range(5, 50):
        row = plan.get(row_index, {})
        serial = row.get("Q")
        if not serial:
            continue

        rows.append(
            {
                "row": row_index,
                "serialNumber": int(number(serial) or 0),
                "clientName": row.get("R") or "",
                "equipmentCode": row.get("S") or "",
                "equipmentName": row.get("T") or "",
                "colorName": row.get("U") or "",
                "city": row.get("V") or "",
                "line": row.get("W") or "",
                "salePriceCop": number(row.get("Y")) or 0,
                "excelProgressPct": number(row.get("N")) or 0,
                "excelTotalHours": number(row.get("AA")) or 0,
                "excelRemainingHours": number(row.get("AB")) or 0,
                "excelRemainingHumanDays": number(row.get("AC")) or 0,
                "excelAccumulatedHours": number(row.get("AD")) or 0,
                "previos": [
                    row.get(column)
                    for column in ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]
                    if (row.get(column) or "").strip()
                ],
                "promisedRaw": row.get("AF") or "",
                "estimatedRaw": row.get("AG") or "",
                "stages": [
                    {"stageId": 1, "completion": completion_from_cell(row.get("AH"))},
                    {"stageId": 2, "completion": completion_from_cell(row.get("AI"))},
                    {"stageId": 3, "completion": completion_from_cell(row.get("AJ"))},
                    {"stageId": 4, "completion": completion_from_cell(row.get("AK"))},
                    {"stageId": 5, "completion": completion_from_cell(row.get("AL"))},
                    {"stageId": 6, "completion": completion_from_cell(row.get("AM"))},
                    {"stageId": 7, "completion": completion_from_cell(row.get("AN"))},
                ],
            }
        )

    catalog = []
    seen_codes = set()
    for row_index in sorted(prices.keys()):
        if row_index < 3:
            continue
        row = prices[row_index]
        code = (row.get("A") or "").strip().upper()
        name = (row.get("B") or "").strip()
        if not code or not name:
            continue
        if code in seen_codes:
            continue
        seen_codes.add(code)
        catalog.append(
            {
                "code": code,
                "name": name,
                "defaultPriceCop": number(row.get("C")),
            }
        )

    payload = {
        "sourceWorkbook": WORKBOOK.name,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "settings": settings,
        "workers": workers,
        "catalog": catalog,
        "rows": rows,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)} with {len(rows)} rows, "
        f"{len(catalog)} catalog entries"
    )


if __name__ == "__main__":
    main()

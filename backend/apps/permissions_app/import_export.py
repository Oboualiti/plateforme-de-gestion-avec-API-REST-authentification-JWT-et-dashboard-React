import csv
import io
from datetime import datetime
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


USER_IMPORT_COLUMNS = [
    "username",
    "email",
    "first_name",
    "last_name",
    "role_key",
    "company_id",
    "entity_id",
    "team_leader_id",
    "is_active",
    "password",
    "job_title",
    "phone_number",
]

XLSX_NAMESPACE = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADER_ALIASES = {
    "user_name": "username",
    "first_nam": "first_name",
    "firstname": "first_name",
    "first name": "first_name",
    "lastname": "last_name",
    "last name": "last_name",
    "role": "role_key",
    "company": "company_id",
    "company_code": "company_id",
    "entity": "entity_id",
    "entity_code": "entity_id",
    "team_leader": "team_leader_id",
    "team_leader_username": "team_leader_id",
    "teamleader": "team_leader_id",
    "active": "is_active",
}


def _normalize_header(value):
    return (value or "").strip().lower()


def _normalize_cell(value):
    if value is None:
        return ""
    return str(value).strip()


def _parse_boolean(value):
    normalized = (value or "").strip().lower()
    if normalized in {"1", "true", "yes", "y", "vrai", "oui"}:
        return True
    if normalized in {"0", "false", "no", "n", "faux", "non"}:
        return False
    raise ValueError("Expected boolean value (true/false).")


def _parse_int(value):
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    return int(cleaned)


def _parse_ref(value):
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return cleaned


def _canonical_header(value):
    normalized = _normalize_header(value)
    return HEADER_ALIASES.get(normalized, normalized)


def _normalize_role_key(value):
    normalized = _normalize_header(value).replace("-", "_").replace(" ", "_")
    role_aliases = {
        "superadmin": "super_admin",
        "super_admin": "super_admin",
        "senior": "senior",
        "manager": "manager",
        "teamleader": "team_leader",
        "team_leader": "team_leader",
        "teamlead": "team_leader",
        "tl": "team_leader",
        "user": "user",
    }
    return role_aliases.get(normalized, normalized)


def _extract_cell_text(cell, shared_strings):
    cell_type = cell.attrib.get("t", "")
    value_node = cell.find("main:v", XLSX_NAMESPACE)
    inline_node = cell.find("main:is/main:t", XLSX_NAMESPACE)

    if inline_node is not None and inline_node.text is not None:
        return inline_node.text
    if value_node is None or value_node.text is None:
        return ""
    raw_value = value_node.text
    if cell_type == "s":
        try:
            return shared_strings[int(raw_value)]
        except (ValueError, IndexError):
            return ""
    return raw_value


def parse_csv_file(file_obj):
    content = file_obj.read()
    if isinstance(content, bytes):
        decoded = content.decode("utf-8-sig")
    else:
        decoded = str(content)
    stream = io.StringIO(decoded)
    reader = csv.DictReader(stream)
    if reader.fieldnames is None:
        raise ValueError("CSV file is empty.")
    return _rows_from_reader(reader.fieldnames, reader)


def parse_xlsx_file(file_obj):
    content = file_obj.read()
    with ZipFile(io.BytesIO(content), "r") as archive:
        if "xl/worksheets/sheet1.xml" not in archive.namelist():
            raise ValueError("XLSX file is missing first worksheet.")
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_tree = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_tree.findall("main:si", XLSX_NAMESPACE):
                text_node = item.find("main:t", XLSX_NAMESPACE)
                if text_node is not None and text_node.text is not None:
                    shared_strings.append(text_node.text)
                else:
                    parts = item.findall(".//main:t", XLSX_NAMESPACE)
                    shared_strings.append("".join(part.text or "" for part in parts))

        sheet_tree = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = sheet_tree.findall("main:sheetData/main:row", XLSX_NAMESPACE)
        if not rows:
            raise ValueError("XLSX file is empty.")

        parsed_rows = []
        for row in rows:
            values_map = {}
            for cell in row.findall("main:c", XLSX_NAMESPACE):
                ref = cell.attrib.get("r", "")
                col_idx = _column_index_from_ref(ref)
                if col_idx is None:
                    continue
                values_map[col_idx] = _extract_cell_text(cell, shared_strings)
            if not values_map:
                parsed_rows.append([])
                continue
            max_col = max(values_map.keys())
            values = [values_map.get(index, "") for index in range(max_col + 1)]
            parsed_rows.append(values)

    header = parsed_rows[0]
    data_rows = parsed_rows[1:]
    row_dicts = []
    for values in data_rows:
        row_dict = {}
        for index, column in enumerate(header):
            key = _normalize_header(column)
            if not key:
                continue
            row_dict[key] = _normalize_cell(values[index] if index < len(values) else "")
        row_dicts.append(row_dict)
    return _rows_from_reader(header, row_dicts)


def _rows_from_reader(fieldnames, rows):
    normalized_headers = [_canonical_header(item) for item in fieldnames]
    missing_required = [col for col in ["username", "role_key"] if col not in normalized_headers]
    if missing_required:
        raise ValueError(f"Missing required columns: {', '.join(missing_required)}.")

    normalized_rows = []
    for idx, row in enumerate(rows, start=2):
        if isinstance(row, dict):
            source = {
                _canonical_header(k): _normalize_cell(v)
                for k, v in row.items()
                if k is not None
            }
        else:
            source = {}
        normalized_row = {column: _normalize_cell(source.get(column, "")) for column in USER_IMPORT_COLUMNS}
        if not any(normalized_row.values()):
            continue

        payload = {}
        payload["username"] = normalized_row["username"]
        payload["email"] = normalized_row["email"]
        payload["first_name"] = normalized_row["first_name"]
        payload["last_name"] = normalized_row["last_name"]
        payload["role_key"] = _normalize_role_key(normalized_row["role_key"])
        payload["password"] = normalized_row["password"]
        payload["job_title"] = normalized_row["job_title"]
        payload["phone_number"] = normalized_row["phone_number"]
        if normalized_row["company_id"]:
            payload["company_id"] = _parse_ref(normalized_row["company_id"])
        if normalized_row["entity_id"]:
            payload["entity_id"] = _parse_ref(normalized_row["entity_id"])
        if normalized_row["team_leader_id"]:
            payload["team_leader_id"] = _parse_ref(normalized_row["team_leader_id"])
        if normalized_row["is_active"]:
            payload["is_active"] = _parse_boolean(normalized_row["is_active"])
        normalized_rows.append({"line": idx, "payload": payload})
    return normalized_rows


def build_users_csv(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=USER_IMPORT_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in USER_IMPORT_COLUMNS})
    return stream.getvalue().encode("utf-8")


def build_users_xlsx(rows):
    workbook_stream = io.BytesIO()
    with ZipFile(workbook_stream, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Users" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )

        sheet_rows = [USER_IMPORT_COLUMNS]
        for row in rows:
            sheet_rows.append([str(row.get(column, "")) for column in USER_IMPORT_COLUMNS])

        row_xml = []
        for row_index, values in enumerate(sheet_rows, start=1):
            cell_xml = []
            for col_index, value in enumerate(values):
                column_letter = _column_name(col_index + 1)
                safe_value = _escape_xml(value)
                cell_xml.append(
                    f'<c r="{column_letter}{row_index}" t="inlineStr"><is><t>{safe_value}</t></is></c>'
                )
            row_xml.append(f'<row r="{row_index}">{"".join(cell_xml)}</row>')

        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>"""
            + "".join(row_xml)
            + """</sheetData>
</worksheet>""",
        )

        timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        archive.writestr(
            "docProps/core.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Users Export</dc:title>
  <dc:creator>Request Project</dc:creator>
  <cp:lastModifiedBy>Request Project</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>
</cp:coreProperties>""",
        )
        archive.writestr(
            "docProps/app.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Request Project</Application>
</Properties>""",
        )
    return workbook_stream.getvalue()


def _column_name(index):
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _escape_xml(value):
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _column_index_from_ref(reference):
    if not reference:
        return None
    letters = []
    for char in reference:
        if char.isalpha():
            letters.append(char.upper())
        else:
            break
    if not letters:
        return None
    index = 0
    for char in letters:
        index = index * 26 + (ord(char) - ord("A") + 1)
    return index - 1

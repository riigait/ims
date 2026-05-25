#!/usr/bin/env python3
"""
IMS CSV Corrector
-----------------
Drop any CSV file (or the multi-section IMS export) in this directory and run:

    python csv_corrector.py              # auto-finds CSV files here
    python csv_corrector.py myfile.csv   # process a specific file

Auto-detects section type (products / categories / locations /
stock-movements / floor-plans) from column names, maps columns to
the correct IMS import format, and writes:

    corrected-XXXXX-YYYYMMDD.csv

No external libraries required.
"""

import csv
import io
import os
import sys
import random
import string
from datetime import datetime
from difflib import get_close_matches

# ---------------------------------------------------------------------------
# IMS import schema per section
# ---------------------------------------------------------------------------

SCHEMAS = {
    'categories': {
        'required': ['name'],
        'optional': ['description'],
        'all':      ['name', 'description'],
    },
    'locations': {
        'required': ['name', 'type'],
        'optional': ['parentId', 'notes'],
        'all':      ['name', 'type', 'parentId', 'notes'],
        'enums': {
            'type': ['branch', 'building', 'floor', 'room', 'rack', 'shelf'],
        },
    },
    'products': {
        'required': ['sku', 'name', 'categoryId', 'unit', 'currentStock', 'lowStockThreshold'],
        'optional': ['description', 'locationId', 'supplier', 'unitPrice',
                     'status', 'expiryDate', 'leadTimeDays', 'notes'],
        'all':      ['sku', 'name', 'description', 'categoryId', 'unit',
                     'currentStock', 'lowStockThreshold', 'locationId',
                     'supplier', 'unitPrice', 'status', 'expiryDate',
                     'leadTimeDays', 'notes'],
        'enums': {
            'status': ['active', 'discontinued', 'obsolete', 'on-backorder'],
            'unit':   ['pcs', 'dozen', 'box', 'pack', 'g', 'kg', 'mg', 'oz',
                       'lb', 'ton', 'ml', 'liter', 'gallon', 'cup', 'mm', 'cm',
                       'm', 'km', 'inch', 'ft', 'yard', 'cm2', 'm2', 'roll',
                       'sheet', 'can', 'bottle', 'bag', 'carton'],
        },
    },
    'stock-movements': {
        'required': ['productId', 'quantity'],
        'optional': ['movementType', 'reason', 'locationId'],
        'all':      ['productId', 'quantity', 'movementType', 'reason', 'locationId'],
        'enums': {
            'movementType': ['stock_in', 'stock_out', 'adjustment', 'transfer',
                             'damaged', 'returned', 'opening_stock', 'deployment',
                             'repair', 'disposal', 'borrowed', 'lost'],
        },
    },
    'floor-plans': {
        'required': ['name', 'width', 'height', 'planJson'],
        'optional': ['locationId', 'description'],
        'all':      ['name', 'width', 'height', 'planJson', 'locationId', 'description'],
    },
}

# ---------------------------------------------------------------------------
# Column alias table  (lowercase key → standard field name)
# ---------------------------------------------------------------------------

ALIASES = {
    # --- categories ---
    'category name': 'name', 'category_name': 'name', 'cat name': 'name',
    'category description': 'description', 'desc': 'description',

    # --- locations ---
    'location name': 'name', 'location_name': 'name', 'loc name': 'name',
    'location type': 'type', 'location_type': 'type', 'loc type': 'type',
    'parent': 'parentId', 'parent id': 'parentId', 'parent_id': 'parentId',
    'parent location': 'parentId', 'parentlocation': 'parentId',
    'remark': 'notes', 'remarks': 'notes', 'location notes': 'notes',

    # --- products ---
    'product sku': 'sku', 'product_sku': 'sku', 'item sku': 'sku',
    'product code': 'sku', 'product_code': 'sku', 'item code': 'sku', 'code': 'sku',
    'product name': 'name', 'product_name': 'name', 'item name': 'name',
    'item': 'name', 'product': 'name',
    'product description': 'description', 'item description': 'description',
    'category id': 'categoryId', 'category_id': 'categoryId', 'cat id': 'categoryId',
    'category': 'categoryId',
    'unit of measure': 'unit', 'unit_of_measure': 'unit', 'uom': 'unit', 'measure': 'unit',
    'stock': 'currentStock', 'current stock': 'currentStock', 'current_stock': 'currentStock',
    'quantity': 'currentStock', 'qty': 'currentStock',
    'stock qty': 'currentStock', 'stock quantity': 'currentStock',
    'low stock': 'lowStockThreshold', 'low_stock': 'lowStockThreshold',
    'low stock threshold': 'lowStockThreshold', 'low_stock_threshold': 'lowStockThreshold',
    'minimum stock': 'lowStockThreshold', 'min stock': 'lowStockThreshold',
    'reorder point': 'lowStockThreshold', 'reorder level': 'lowStockThreshold',
    'location id': 'locationId', 'location_id': 'locationId', 'loc id': 'locationId',
    'location': 'locationId',
    'vendor': 'supplier', 'vendor name': 'supplier', 'supplier name': 'supplier',
    'brand': 'supplier',
    'price': 'unitPrice', 'unit price': 'unitPrice', 'unit_price': 'unitPrice',
    'cost': 'unitPrice', 'cost price': 'unitPrice',
    'product status': 'status', 'item status': 'status',
    'expiry': 'expiryDate', 'expiry date': 'expiryDate', 'expiry_date': 'expiryDate',
    'expiration': 'expiryDate', 'expiration date': 'expiryDate',
    'lead time': 'leadTimeDays', 'lead_time': 'leadTimeDays',
    'lead time days': 'leadTimeDays', 'lead_time_days': 'leadTimeDays',
    'product notes': 'notes', 'item notes': 'notes',

    # --- stock-movements ---
    'product id': 'productId', 'product_id': 'productId', 'item id': 'productId',
    'movement type': 'movementType', 'movement_type': 'movementType',
    'movement qty': 'quantity', 'movement quantity': 'quantity',
    'movement reason': 'reason', 'note': 'reason',

    # --- floor-plans ---
    'floor plan name': 'name', 'plan name': 'name',
    'floor plan width': 'width', 'plan width': 'width',
    'floor plan height': 'height', 'plan height': 'height',
    'plan json': 'planJson', 'plan data': 'planJson',
    'floor plan data': 'planJson',
}

# Columns that strongly signal a particular section type
SIGNALS = {
    'categories':     {'name', 'description', 'category name', 'category_name'},
    'locations':      {'type', 'parentid', 'parent id', 'location type', 'location_type'},
    'products':       {'sku', 'currentstock', 'current stock', 'lowstockthreshold',
                       'low stock threshold', 'categoryid', 'category id', 'unitprice'},
    'stock-movements':{'productid', 'product id', 'movementtype', 'movement type',
                       'movement_type'},
    'floor-plans':    {'planjson', 'plan json', 'plandata', 'plan data', 'width', 'height'},
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rand_id(n=5):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))


def norm(h: str) -> str:
    return h.strip().lower().replace('_', ' ').replace('-', ' ')


def map_column(header: str, all_fields: list) -> str | None:
    h = norm(header)
    # 1. exact match against standard field names (case-insensitive)
    for f in all_fields:
        if h == f.lower():
            return f
    # 2. alias table
    candidate = ALIASES.get(h)
    if candidate and candidate in all_fields:
        return candidate
    # 3. fuzzy match against standard field names
    lower_fields = [f.lower() for f in all_fields]
    hits = get_close_matches(h, lower_fields, n=1, cutoff=0.75)
    if hits:
        return all_fields[lower_fields.index(hits[0])]
    # 4. fuzzy match through aliases
    alias_hits = get_close_matches(h, list(ALIASES), n=1, cutoff=0.80)
    if alias_hits:
        candidate = ALIASES[alias_hits[0]]
        if candidate in all_fields:
            return candidate
    return None


def detect_section(headers: list) -> str:
    normed = {norm(h) for h in headers}
    scores = {sec: len(normed & sigs) for sec, sigs in SIGNALS.items()}
    best = max(scores, key=scores.get)
    if scores[best] > 0:
        return best
    # fall back: highest column-mapping coverage
    best_sec, best_cov = 'products', 0
    for sec, schema in SCHEMAS.items():
        cov = sum(1 for h in headers if map_column(h, schema['all']) is not None)
        if cov > best_cov:
            best_cov, best_sec = cov, sec
    return best_sec


def normalize_enum(value: str, valid: list) -> str:
    v = value.lower().strip().replace(' ', '_').replace('-', '_')
    for val in valid:
        if v == val.lower().replace('-', '_'):
            return val
    hits = get_close_matches(v, [x.lower() for x in valid], n=1, cutoff=0.6)
    if hits:
        return valid[[x.lower() for x in valid].index(hits[0])]
    return value


def correct_rows(rows: list, section: str) -> tuple:
    schema = SCHEMAS[section]
    all_fields = schema['all']
    enums = schema.get('enums', {})

    if not rows:
        return [], {'mapped': {}, 'unmapped': [], 'missing_required': schema['required'], 'rows': 0}

    input_headers = list(rows[0].keys())
    mapping = {}   # input_col → standard_col  (first match wins per target)
    unmapped = []

    for h in input_headers:
        std = map_column(h, all_fields)
        if std and std not in mapping.values():
            mapping[h] = std
        else:
            unmapped.append(h)

    missing_required = [r for r in schema['required'] if r not in mapping.values()]

    corrected = []
    for row in rows:
        new_row = {f: '' for f in all_fields}
        for src, dst in mapping.items():
            val = row.get(src, '').strip()
            if dst in enums and val:
                val = normalize_enum(val, enums[dst])
            new_row[dst] = val
        corrected.append(new_row)

    report = {
        'mapped':           mapping,
        'unmapped':         unmapped,
        'missing_required': missing_required,
        'rows':             len(corrected),
    }
    return corrected, report


def write_csv(path: str, rows: list, fieldnames: list):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def print_report(section: str, report: dict, out_name: str):
    status = 'OK' if not report['missing_required'] else 'INCOMPLETE'
    print(f"\n  [{status}] {section}")
    print(f"  Rows    : {report['rows']}")
    if report['mapped']:
        print(f"  Mapped  : {len(report['mapped'])} column(s)")
        for src, dst in report['mapped'].items():
            arrow = '  ' if norm(src) == dst.lower() else '->'
            print(f"            {src!r:30s} {arrow} {dst!r}")
    if report['unmapped']:
        print(f"  Skipped : {report['unmapped']}")
    if report['missing_required']:
        print(f"  MISSING : {report['missing_required']}  <- fill these manually")
    print(f"  Output  : {out_name}")


# ---------------------------------------------------------------------------
# Multi-section IMS export parser
# ---------------------------------------------------------------------------

def parse_ims_export(filepath: str) -> dict:
    """
    Parse a multi-section IMS export file.
    Returns { section_name: [row_dicts, ...], ... }
    """
    sections = {}
    current_section = None
    current_headers = None
    current_rows = []

    with open(filepath, newline='', encoding='utf-8-sig') as f:
        content = f.read()

    for line in content.splitlines():
        if not line.strip():
            continue
        if line.startswith('#IMS_SECTION,'):
            if current_section is not None and current_headers is not None:
                sections[current_section] = current_rows
            current_section = line.split(',', 1)[1].strip()
            current_headers = None
            current_rows = []
            continue
        reader = csv.reader(io.StringIO(line))
        values = next(reader)
        if current_section and current_headers is None:
            current_headers = [v.strip() for v in values]
        elif current_section and current_headers:
            if any(v.strip() for v in values):
                row = dict(zip(current_headers, [v.strip() for v in values]))
                current_rows.append(row)

    if current_section is not None and current_headers is not None:
        sections[current_section] = current_rows

    return sections


def load_format_columns(path: str) -> dict:
    """
    Read format.csv and return { section_name: [col1, col2, ...] }.
    Only reads the header row for each section — data rows are ignored.
    """
    result = {}
    current_section = None
    with open(path, encoding='utf-8-sig') as f:
        content = f.read()
    for line in content.splitlines():
        if not line.strip():
            continue
        if line.startswith('#IMS_SECTION,'):
            current_section = line.split(',', 1)[1].strip()
            continue
        if current_section and current_section not in result:
            reader = csv.reader(io.StringIO(line))
            cols = [c.strip() for c in next(reader)]
            result[current_section] = cols
    return result


def apply_format(format_path: str):
    """Update SCHEMAS['all'] with columns from format.csv."""
    if not os.path.exists(format_path):
        return
    fmt = load_format_columns(format_path)
    for section, cols in fmt.items():
        if section in SCHEMAS and cols:
            SCHEMAS[section]['all'] = cols
    loaded = ', '.join(f"{s}({len(c)})" for s, c in fmt.items() if s in SCHEMAS)
    print(f"  format.csv loaded  ->  {loaded}")


# ---------------------------------------------------------------------------
# Main entry per file
# ---------------------------------------------------------------------------

def process_file(input_path: str):
    filename  = os.path.basename(input_path)
    out_dir   = os.path.dirname(input_path)
    date_str  = datetime.now().strftime('%Y%m%d')

    print(f"\n{'-'*55}")
    print(f"  File : {filename}")

    # Detect if it is a multi-section IMS export
    with open(input_path, encoding='utf-8-sig') as f:
        first_line = f.readline().strip()

    if first_line.startswith('#IMS_SECTION'):
        sections = parse_ims_export(input_path)
        if not sections:
            print("  No recognizable sections found.")
            return
        print(f"  Format: IMS export  ({', '.join(sections.keys())})")
        for sec_name, rows in sections.items():
            if sec_name not in SCHEMAS:
                print(f"  Skip  : unknown section '{sec_name}'")
                continue
            corrected, report = correct_rows(rows, sec_name)
            uid      = rand_id(5)
            out_name = f"corrected-{uid}-{date_str}.csv"
            out_path = os.path.join(out_dir, out_name)
            write_csv(out_path, corrected, SCHEMAS[sec_name]['all'])
            print_report(sec_name, report, out_name)
    else:
        # Plain CSV
        with open(input_path, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            headers = list(reader.fieldnames or [])
            rows    = list(reader)

        section = detect_section(headers)
        print(f"  Format: Plain CSV")
        corrected, report = correct_rows(rows, section)
        uid      = rand_id(5)
        out_name = f"corrected-{uid}-{date_str}.csv"
        out_path = os.path.join(out_dir, out_name)
        write_csv(out_path, corrected, SCHEMAS[section]['all'])
        print_report(section, report, out_name)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Always load format.csv first to set the target column structure
    apply_format(os.path.join(script_dir, 'format.csv'))

    if len(sys.argv) > 1:
        target = sys.argv[1]
        if not os.path.isabs(target):
            target = os.path.join(script_dir, target)
        if not os.path.exists(target):
            print(f"File not found: {target}")
            sys.exit(1)
        process_file(target)
        return

    csv_files = sorted(
        f for f in os.listdir(script_dir)
        if f.lower().endswith('.csv')
        and not f.startswith('corrected-')
        and f != 'format.csv'
    )

    if not csv_files:
        print("No CSV files found in this directory.")
        print("Place your CSV file(s) here and run again.")
        sys.exit(0)

    print(f"Found {len(csv_files)} file(s) to process.")
    for fname in csv_files:
        process_file(os.path.join(script_dir, fname))

    print(f"\n{'-'*55}")
    print("Done.")


if __name__ == '__main__':
    main()

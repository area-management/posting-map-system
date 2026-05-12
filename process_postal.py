import csv
import re

# Read District 2 constraints
district_2_cities = []
district_2_exact = []
with open('data/三重県選挙区区割り.csv', 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    next(reader) # skip header
    for row in reader:
        if row[0] == '第2区':
            city = row[2]
            detail = row[3]
            if detail:
                district_2_exact.append(detail)
            else:
                district_2_cities.append(city)

addresses = []

# Process MIE_POSTAL.CSV
with open('data/MIE_POSTAL.CSV', 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) < 9: continue
        pref = row[6]
        city = row[7]
        town = row[8]
        
        if town == '以下に掲載がない場合': continue
        
        if city in district_2_cities:
            # We add all towns for these cities
            addresses.append(f"{pref}{city}{town}")

# For exact constraints like "四日市市日永地区市民センター管内", we just add them as is since we can't map them to postal towns safely
for detail in district_2_exact:
    addresses.append(f"三重県{detail}")

# Chome expansion
expanded_addresses = []
for addr in addresses:
    # Match something like "１～５丁目" or "1〜5丁目"
    match = re.search(r'([０-９0-9]+)[〜～\-]([０-９0-9]+)丁目', addr)
    if match:
        start = int(match.group(1).translate(str.maketrans('０１２３４５６７８９', '0123456789')))
        end = int(match.group(2).translate(str.maketrans('０１２３４５６７８９', '0123456789')))
        base_addr = addr[:match.start()]
        for i in range(start, end + 1):
            expanded_addresses.append(f"{base_addr}{i}丁目")
    else:
        expanded_addresses.append(addr)

# Generate GAS code
gas_code = """// GAS code is managed directly in the Google Apps Script editor.

const cities = [
"""
for addr in expanded_addresses:
    # Map link
    map_url = f"https://www.google.com/maps/search/?api=1&query={addr}"
    gas_code += f'  ["{addr}", "{map_url}"],\n'

gas_code += """];

function populateAreaSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Area');
  if (!sheet) return;
  
  // Start from B2, C2
  const startRow = 2;
  const numRows = cities.length;
  
  // Clear existing
  sheet.getRange(startRow, 2, sheet.getMaxRows(), 2).clearContent();
  
  // Set values
  sheet.getRange(startRow, 2, numRows, 2).setValues(cities);
}
"""

with open('scripts/gas.gs', 'w', encoding='utf-8') as f:
    f.write(gas_code)

print("GAS script generated successfully. Total addresses:", len(expanded_addresses))

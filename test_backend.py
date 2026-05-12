import csv
import re
import os

def extract_district_addresses(district_csv_path, postal_csv_path, target_district, target_pref):
    address_map = {}
    
    # Read District Rules
    target_rules = []
    with open(district_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # skip header
        for row in reader:
            if row and row[0] == target_district and row[1] == target_pref:
                target_rules.append({'city': row[2], 'townArea': row[3] if len(row) > 3 else ""})

    # Read Postal Data
    postal_data = []
    with open(postal_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            postal_data.append(row)

    for rule in target_rules:
        city = rule['city']
        town_area = rule['townArea']
        
        if town_area:
            # Specific town/ward from district map
            addr_string = town_area if town_area.startswith(city) else city + town_area
            address_map[addr_string] = "MATCHED"
        else:
            # All towns in this city from postal data
            for row in postal_data:
                if len(row) > 7 and row[6] == target_pref and row[7] == city:
                    town_raw = row[8]
                    if town_raw and town_raw != "以下に掲載がない場合":
                        # Clean town_raw (remove parentheses content like gas_v2.gs does)
                        clean_town = re.sub(r'（.*?）', '', town_raw)
                        addr = city + clean_town
                        if addr not in address_map:
                            address_map[addr] = "POSTAL_EXPANDED"
                            
    return address_map

target_district = "第2区"
target_pref = "三重県"
results = extract_district_addresses(
    'data/三重県選挙区区割り.csv',
    'data/MIE_POSTAL.CSV',
    target_district,
    target_pref
)

print(f"--- テスト結果: {target_pref} {target_district} ---")
print(f"抽出総数: {len(results)} エリア（町丁目単位）")

city_summary = {}
for addr in results:
    match = re.match(r'^(.+?市|.+?郡.+?町|.+?郡.+?村)', addr)
    city = match.group(1) if match else "その他"
    city_summary[city] = city_summary.get(city, 0) + 1

print("\n[市区町村別 展開予定シート数]")
for city, count in sorted(city_summary.items()):
    print(f"{city}: {count} エリア")

print("\n[データ抽出サンプル (最初の10件)]")
for i, addr in enumerate(list(results.keys())[:10]):
    print(f"{i+1}. {addr}")

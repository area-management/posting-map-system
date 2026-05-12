const fs = require('fs');
const path = require('path');

// Mocking some GAS-like utilities
const parseCsv = (text) => text.trim().split('\n').map(line => {
    // Basic CSV split, handling quotes
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        // Simple split for this test (assumes clean CSV without nested commas in values)
        // Wait, let's use a slightly better one
    }
    return line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
});

// Implementation of the logic from gas_v2.gs
function extractDistrictAddresses(districtCsvPath, postalCsvPath, targetDistrict, targetPref) {
    const districtData = fs.readFileSync(districtCsvPath, 'utf8').split('\n').map(l => l.split(','));
    const postalData = fs.readFileSync(postalCsvPath, 'utf8').split('\n').map(l => l.split(','));

    const targetRules = [];
    for (let i = 1; i < districtData.length; i++) {
        const row = districtData[i];
        if (row && row[0] === targetDistrict && row[1] === targetPref) {
            targetRules.push({ city: row[2], townArea: row[3] || "" });
        }
    }

    const addressMap = new Map();
    targetRules.forEach(rule => {
        if (rule.townArea) {
            // If specific town is defined in district map
            const addrString = rule.townArea.startsWith(rule.city) ? rule.townArea : rule.city + rule.townArea;
            addressMap.set(addrString, "MATCHED");
        } else {
            // Expand from postal data
            postalData.forEach(row => {
                if (row && row[6] === targetPref && row[7] === rule.city) {
                    const townRaw = row[8];
                    if (townRaw && townRaw !== "以下に掲載がない場合") {
                        const addr = rule.city + townRaw.replace(/（.*?）/g, "");
                        addressMap.set(addr, "POSTAL_EXPANDED");
                    }
                }
            });
        }
    });

    return Array.from(addressMap, ([address, type]) => ({ address, type }));
}

const targetDistrict = "第2区";
const targetPref = "三重県";
const results = extractDistrictAddresses(
    'data/三重県選挙区区割り.csv',
    'data/MIE_POSTAL.CSV',
    targetDistrict,
    targetPref
);

console.log(`--- テスト結果: ${targetPref} ${targetDistrict} ---`);
console.log(`抽出件数: ${results.length} 件`);
console.log("\n[抽出サンプル]");
results.slice(0, 10).forEach(r => console.log(`- ${r.address} (${r.type})`));

const citySummary = {};
results.forEach(r => {
    const city = r.address.match(/^(.+?市)/) ? r.address.match(/^(.+?市)/)[1] : "その他";
    citySummary[city] = (citySummary[city] || 0) + 1;
});

console.log("\n[市区町村別集計]");
Object.entries(citySummary).forEach(([city, count]) => {
    console.log(`${city}: ${count} エリア`);
});

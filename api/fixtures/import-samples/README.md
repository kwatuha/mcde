# Import sample files

Tracked Excel fixtures for manual testing via **Data → Central Import → Beneficiaries**.

## Kalama RRI beneficiaries

**File:** `beneficiary-import-kalama-rri-2025-26.xlsx`

8 sample rows linked to **Kalama Ward Livelihoods RRI 2025/26** (migration `20260630_rri_programme_sample.sql`):

| Type | Count |
|------|-------|
| Individual | 2 |
| Group | 2 |
| Household | 2 |
| Institution | 2 |

### Before import

1. Run migration `api/migrations/20260630_rri_programme_sample.sql` so the RRI programme exists.
2. Go to **Data → Central Import**, choose **Beneficiaries**, upload this file, preview, then confirm.

RRI Programme and Project columns use names (and project ID prefix) so the file works without hard-coded programme IDs. Site column uses site names (`Kalama Central`, `Kathome`).

### Regenerate

```bash
# Offline fixture (no database)
cd api && node scripts/generateBeneficiarySampleImport.js --offline

# With live programme/site IDs from your database
cd api && node scripts/generateBeneficiarySampleImport.js
```

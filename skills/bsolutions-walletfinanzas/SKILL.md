---
name: bsolutions-walletfinanzas
description: Specialist knowledge for the Wallet Finanzas Personales ecosystem. Covers the Android Kotlin app (Room, Hilt, Compose, deduplication engine), Laravel backend API (Sanctum, MariaDB), VPS deployment (62.171.174.191), Firebase integration, Gmail/Microsoft OAuth email sync, and operational procedures. Use when querying transactions, debugging sync, reviewing accounts, deploying updates, or investigating detected movements.
---

# Wallet Finanzas Personales — Agent Knowledge Base

## 1. Project Overview

**Wallet Finanzas Personales** is a 100% offline-first personal finance app for Android.
Users track income, expenses, transfers, budgets, goals, debts, and recurring payments.
The app detects banking notifications (email + push) and matches them against the ledger
to auto-categorize and deduplicate transactions.

- **Package:** `com.bsolutions.wallet`
- **Repository:** `https://github.com/wailanbrea/walletFinanzas.git`
- **Local Path:** `C:\xampp\php\www\wallet Finanzas\WalletFinanzasPersonales`
- **Docs:** `C:\xampp\php\www\wallet Finanzas\docs\` (00–09, 99_TODO)

## 2. Architecture

```
Pattern: Clean Architecture + MVVM
UI (Jetpack Compose) → ViewModel → UseCase → Repository → Room (local DB)
```

### Source packages (`com.bsolutions.wallet`)

| Layer | Packages |
|---|---|
| **Presentation** | `accounts`, `auth`, `banknotifications`, `budgets`, `categories`, `categoryrules`, `dashboard`, `debts`, `detectedmovements`, `emailconnections`, `goals`, `importcsv`, `navigation`, `notifications`, `plannedpayments`, `profile`, `reports`, `security`, `settings`, `sync`, `sync_settings`, `transactions` |
| **Domain** | `email`, `model`, `repository`, `usecase` |
| **Data** | `local` (Room DAO + entities), `preferences` (DataStore), `repository` |
| **Core** | `common`, `database`, `deduplication`, `designsystem`, `email`, `financial`, `network`, `notifications`, `sync` |

### Key classes

- `MainActivity.kt`, `MainViewModel.kt`, `WalletApp.kt`
- `FinancialEventMatcher.kt` — deduplication engine (currency normalization, amount matching)
- `DetectedMovementRepository.kt` — ingestion, canonical grouping, auto-dismiss duplicates
- `DetectedMovementsViewModel.kt` — UI state, book/dismiss/retry flows, date filtering

### Tech stack

| Component | Version / Detail |
|---|---|
| Kotlin | 2.1.0 |
| Compose | Material 3 |
| DI | Hilt |
| DB | Room (SQLite) — minor units (Long cents) |
| Network | Retrofit + OkHttp + Kotlinx Serialization |
| Async | Coroutines + StateFlow |
| Background | WorkManager (`SyncWorker`) |
| Firebase | Auth (Email/Pass), FCM, Crashlytics, App Check — **Spark Free Tier only** |
| SDK | minSdk 26, targetSdk 35, compileSdk 35 |
| Money | `BigDecimal` in domain, `Long` minor units in Room |

## 3. Room Database Schema

### Key Entities (`data.local.entity`)

| Entity / Table | PK | Key Fields |
|---|---|---|
| `AccountEntity` / `accounts` | `(ownerId, id)` | `name`, `type` (CASH/BANK/SAVINGS), `balance`, `currency` (default "USD"), `countryCode`, `institutionName`, `cardLastFour`, `creditLimit` |
| `TransactionEntity` / `transactions` | `(ownerId, id)` | `accountId`, `amount` (Long), `type` (EXPENSE/INCOME/TRANSFER), `categoryId`, `date` (epoch ms), `note`, `currency` (default "DOP"), `debtId` |
| `CategoryEntity` / `categories` | `(ownerId, id)` | `name`, `icon`, `colorHex`, `type` (EXPENSE/INCOME/BOTH) |
| `BudgetEntity` / `budgets` | `(ownerId, id)` | `categoryId`, `limitAmount`, `spentAmount`, `period` |
| `GoalEntity` / `goals` | `(ownerId, id)` | `name`, `targetAmount`, `savedAmount`, `targetDate` |
| `PlannedPaymentEntity` / `planned_payments` | `(ownerId, id)` | recurring payment definitions |
| `DetectedMovementEntity` / `detected_movements` | `(ownerId, id)` | `canonicalId`, `status` (PENDING/APPROVED/DISMISSED), `duplicateOfId`, `possibleDuplicateOfId`, `amountMinor`, `currency`, `direction`, `merchant`, `source`, `occurredAt` |

### Key DAO methods (`TransactionDao`)

- `findRecentPotentialDuplicates(ownerId, type, currency, from, to)` — exact currency match
- `findRecentByTypeAndDate(ownerId, type, from, to)` — no currency filter (normalized in Kotlin)
- `getTransactionById(ownerId, id)`
- `getTransactionsByAccount(ownerId, accountId)` → Flow

## 4. Deduplication Engine

### Flow
1. Notifications/emails ingested → `DetectedMovementEntity` created with `status = "PENDING"`
2. `deduplicateExistingPendingMovements()` runs on ViewModel init
3. Checks `transactionIdForCanonical(canonicalId)` — deterministic UUID
4. Falls back to `findManualPossibleDuplicate()` — queries by type+date, compares amounts with tolerance
5. `amountsMatch()` normalizes currencies (RD$ → DOP, USD$ → USD, etc.)
6. Matched → status set to `DISMISSED`, hidden from UI
7. `toActionableGroups()` filters `status == "PENDING"` only

### Known pitfalls
- Account currency stored as "RD$" vs detected movement normalized to "DOP" — fixed by removing currency from SQL query
- `book()` sets status to "APPROVED" via `completeBookingReview()`
- Multi-evidence movements (≥2) auto-booked unless `isPossibleDuplicate` is true

## 5. Laravel Backend API

### Connection

| Field | Value |
|---|---|
| **Base URL** | `https://apiwallet.bsolutions.dev/api/v1/` |
| **Auth** | Laravel Sanctum (Bearer token) |
| **Framework** | Laravel 11 |
| **PHP** | 8.2 |

### Endpoints (all under `/api/v1/`)

**Public:**
- `GET /health` → `{"status":"ok"}`
- `POST /auth/register`
- `POST /auth/login`
- `GET /oauth/{gmail|microsoft}/callback`

**Protected (auth:sanctum):**
- `POST /auth/logout`
- `GET|PATCH /user`
- `GET|POST /accounts`
- `GET|POST /transactions`, `PATCH|DELETE /transactions/{id}`
- `GET|POST /categories`, `/budgets`, `/goals`, `/debts`, `/planned-payments`
- `GET /bank-connections`
- `GET /email-connections`
- `POST /email-connections/{provider}/authorization-url`
- `POST /email-connections/{provider}/sync`
- `GET /email-connections/{provider}/sync-runs/{run}`
- `DELETE /email-connections/{provider}`
- `GET /email-candidates`, `PATCH /email-candidates/{id}`

### Querying user data via API

```bash
# 1. Authenticate
curl -X POST https://apiwallet.bsolutions.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@email.com","password":"..."}'
# Response: { "token": "xxx" }

# 2. Query transactions
curl -H "Authorization: Bearer xxx" \
  "https://apiwallet.bsolutions.dev/api/v1/transactions?date=2026-08-04"

# 3. Query accounts
curl -H "Authorization: Bearer xxx" \
  "https://apiwallet.bsolutions.dev/api/v1/accounts"
```

## 6. VPS Deployment

| Field | Value |
|---|---|
| **IP** | `62.171.174.191` |
| **Domain** | `apiwallet.bsolutions.dev` |
| **OS** | Windows (XAMPP) |
| **Server Path** | `C:\xampp\htdocs\walletFinanzas` |
| **Web Server** | Apache (XAMPP) behind Cloudflare |
| **SSL** | Let's Encrypt via Cloudflare |
| **PHP** | `C:\xampp\php\php.exe` (8.2.12) |

### Database (MariaDB on VPS)

| Field | Value |
|---|---|
| **Engine** | MariaDB |
| **Host** | `127.0.0.1:3306` (local on VPS) |
| **Database** | `wallet_finanzas` |
| **User** | `wallet_app` |
| **Password** | *(only in VPS `.env`, not in repo)* |

### Deploy procedure

```powershell
Set-Location "C:\xampp\htdocs\walletFinanzas"
git pull --ff-only origin main
& "C:\xampp\php\php.exe" artisan migrate --force
& "C:\xampp\php\php.exe" artisan optimize:clear
& "C:\xampp\php\php.exe" artisan config:cache
& "C:\xampp\php\php.exe" artisan route:cache
& "C:\xampp\php\php.exe" artisan view:cache
```

## 7. Firebase

| Field | Value |
|---|---|
| **Project ID** | `walletfinanzas-51756` |
| **Project Number** | `881599645662` |
| **Package** | `com.bsolutions.wallet` |
| **API Key** | `AIzaSyA_crUSVYHYgJnRNyKSq04o7f2VV8m7iTs` |
| **Services** | Firebase Auth (Email/Pass), FCM, Crashlytics, App Check |
| **Tier** | Spark (Free) — **NO Firestore, NO Storage, NO Cloud Functions** |

## 8. OAuth Email Sync

### Google Gmail

| Field | Value |
|---|---|
| Client ID | `33025523895-5dgi9aqjb54vvd7dhc1gie92vouqkh81.apps.googleusercontent.com` |
| Redirect URI | `https://apiwallet.bsolutions.dev/api/v1/oauth/gmail/callback` |
| Scope | `gmail.readonly` |

### Microsoft Outlook

| Field | Value |
|---|---|
| Client ID | `4fa272f6-781d-4a09-92f0-aace3408b19d` |
| Tenant ID | `common` |
| Redirect URI | `https://apiwallet.bsolutions.dev/api/v1/oauth/microsoft/callback` |
| Scope | `Mail.Read`, `offline_access` |

### Deep Link callback
`walletfinanzas://email-oauth?provider={gmail|microsoft}&status={connected|failed}`

## 9. Cost Guard Rules

- 100% Offline-First. Room is the source of truth.
- Prohibited: Firebase Blaze, Phone Auth, Firestore, Storage, Cloud Functions.
- Supabase free limits: 500MB DB, 50k MAU, 1GB bandwidth.
- MVP limits: 25 beta users, max 3,000 tx/user, max 20 accounts.
- Auto sync every 12h, manual sync max 3/day.

## 10. Key File Paths

| Description | Path |
|---|---|
| Android source | `C:\xampp\php\www\wallet Finanzas\WalletFinanzasPersonales\app\src\main\java\com\bsolutions\wallet\` |
| Room entities | `...\data\local\entity\Entities.kt` |
| Room DAOs | `...\data\local\dao\TransactionDao.kt` |
| Detected movements | `...\data\repository\DetectedMovementRepository.kt` |
| Deduplication | `...\core\deduplication\FinancialEventMatcher.kt` |
| ViewModel | `...\presentation\detectedmovements\DetectedMovementsViewModel.kt` |
| API routes | `...\routes\api.php` |
| Deploy docs | `...\deploy\README.md`, `VPS_PULL.md`, `EMAIL_OAUTH_SETUP.md` |
| Production env template | `...\deploy\.env.production.example` |
| Firebase config | `...\app\google-services.json` |
| Local env | `...\.env` |
| Project docs | `C:\xampp\php\www\wallet Finanzas\docs\` |

## Exit and report

When answering questions about WalletFinanzas, always specify:
- Which layer (Android/Backend/VPS/Firebase) is involved
- Relevant file paths and code references
- API endpoints with auth requirements
- Database tables and fields
- Any cost/security constraints from the Cost Guard rules

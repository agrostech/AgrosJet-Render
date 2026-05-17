# Test Credentials

## System Admin
- Username: onurertas
- Password: Delivery32..
- Login URL: /admin-login -> POST /api/auth/admin/login

## Super Admin (Boston / Isparta company superadmin)
- Username: superadmin
- Password: Test123!
- Role: superadmin
- Company: 0005ec2a-04ca-4250-9530-ecc6fde165f1

## Company Admin (Atakan)
- Username: atakansari
- Password: Test123!
- Role: admin
- Company: 0005ec2a-04ca-4250-9530-ecc6fde165f1

## Company Admin (AgrosJet Isparta)
- Username: admin
- Password: 123456
- Login URL: /admin-login -> POST /api/auth/admin/login

## Restaurant Admin
- Username: restoran2
- Password: 123456
- Login URL: /restoran-login -> POST /api/restaurant-users/login

## Courier (Test) — used by ExemptionRequest tests
- Phone: 05550003201
- Password: Test123!
- Courier ID: feae169f-222b-45df-b9e8-0664a186031a
- Login URL: /courier-login -> POST /api/auth/courier/login

## Courier (Onur)
- Phone: 05553337766
- Password: 123456 (NOTE: currently returns 401 — likely password rotated in prod; primary courier test account is 05550003201/Test123!)
- Courier ID: f7188370-b3c6-46e9-bd49-acf3e18c1df7
- Login URL: /courier-login -> POST /api/auth/courier/login
- Status: contract_accepted=true, fesih_accepted=true, 7/7 documents uploaded

## Courier (Alternative)
- Phone: 05550003201
- Password: Test123!

## Testing Bypass
- Email verification OTP code is hardcoded to: 117200

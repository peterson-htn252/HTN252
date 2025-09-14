# Ripple Powered Transparent Aid Wallet

A transparent, auditable, and fraud resistant aid distribution platform built on Ripple and XRPL testnet.

## Problem

When disasters strike such as earthquakes, floods, and conflicts, aid money often gets delayed in bureaucracy, misused by intermediaries, or lost without accountability. Donors do not know where their money went, and recipients may never see the funds.

## Solution

We provide a Ripple based donation and voucher distribution platform where

- Donors give via card or crypto into pooled XRPL testnet funds
- NGOs issue digital vouchers to verified recipients
- Recipients redeem vouchers at local stores using QR codes, SMS, or facial recognition
- Stores are paid out in local currency through an off ramp partner
- Every transaction is public and auditable on XRPL

**NGO Dashboard**
![NGO Dashboard](/img/image.png)

**Donor Dashboard - Find Donation Programs**
![Donor Dashboard](/img/rrss1.png)

**Donor Dashboard - Track Your Donation**
![Donor Dashboard](/img/rrss3.png)

**Donor Dashboard - Stripe Payment**
![Donor Dashboard](/img/rrss5.png)

**Donor Dashboard - Successfu Payment**
![Donor Dashboard](/img/rrss7.png)

**Merchant Dashboard**
![Biometric Face Scan](/img/image-8.png)


## System Architecture

Core Flows

1. Donation  
   Donor to NGO program fund (XRPL wallet plus Supabase tracking).

2. Voucher Issuance  
   NGO to Recipient as signed voucher payload (JWT, QR, or SMS).

3. Redemption  
   Recipient presents voucher at store.  
   Policy checks and fraud scoring occur.  
   XRPL payment is sent to the off ramp partner, and fiat payout goes to the store.

4. Audit  
   Donor and NGO dashboards show live redemption rates, maps, and XRPL transaction hashes.

## Feature Overview

Donor Dashboard
- Donate to specific programs
- View impact including vouchers issued and redeemed
- Access transparent NGO spending reports
- Analytics Copilot for weekly summaries

NGO Console
- Manage programs and policies such as daily caps, geofences, and category restrictions
- Issue vouchers to recipients
- Monitor alerts and flagged anomalies
- Export reports

Recipient Wallet
- View balances
- Redeem vouchers via QR or SMS
- Access voucher history
- Support for face map login for low device access environments

Store Portal
- Scan and redeem vouchers
- View payout list and XRPL hashes
- Request instructions for fiat cash out

## AI Agents

- SMS Copilot for multilingual queries and balance checks
- Fraud Guard to detect anomalies in redemptions
- Policy Agent to enforce NGO rules and explain denials in plain language
- Analytics Copilot to summarize activity for donors and NGOs

## Security and Compliance

- Custodial wallets for MVP recipients (server signed XRPL testnet transactions)
- Short lived signed JWT vouchers with nonce replay protection
- Rate limits per store and per recipient
- Masked and encrypted personally identifiable information
- Future plan for business verification using third party services

## Technology Stack

- Backend: FastAPI with Supabase (Postgres)
- Ledger: XRPL Testnet using xrpl py
- AI: LLMs for policy explanations and summaries
- Facial Recognition: InsightFace for biometric recipient mapping
- Frontend: Next.js dashboards, PWA for recipients

## Installation

git clone https://github.com/your-org/transparent-aid-wallet
cd transparent-aid-wallet

pip install -r requirements.txt
uvicorn app:app --reload

Environment variables

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
XRPL_RPC_URL=https://s.altnet.rippletest.net:51234
XRPL_NETWORK=testnet
SECRET_KEY=dev-secret
JWT_SECRET=jwt-secret

## Database Schema

- ngos: NGO organizations
- programs: relief programs
- recipients: aid beneficiaries with optional face map embedding
- recipient_balances: current balances
- payouts: store redemptions
- donations and expenses: financial audit trail
- credentials: verifiable credentials (VC JWT)

## Voucher Lifecycle

States: ISSUED, APPROVED, HELD, REDEEMED, CANCELLED, EXPIRED

Voucher payload example

{
  "v": "1",
  "voucherId": "uuid",
  "programId": "uuid",
  "amount": 2500,
  "currency": "PHP",
  "exp": 1735689600,
  "sig": "platform-signature"
}

## Demo Flow

1. Donor donates 100 USD to Typhoon Relief Program
2. NGO issues a voucher worth 2500 PHP and recipient receives SMS
3. Recipient attempts redemption outside allowed location and is denied with an explanation
4. Recipient redeems successfully at a valid store, and XRPL transaction hash is shown
5. Donor sees dashboard with impact metrics such as 80 percent redeemed and total distributed

## Roadmap

- Testnet XRPL integration complete
- Supabase schema and FastAPI APIs complete
- Facial recognition enrollment and redemption in progress
- AI policy enforcement and fraud scoring in progress
- Donor and NGO dashboards in progress
- SMS Copilot integration planned
- Stablecoin off ramp planned

Future features include non custodial wallets, micro loaning of idle funds, recipient thank you messages, and expanded compliance features.

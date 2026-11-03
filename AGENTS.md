# Project Rules: ALLEYRICH — SD Garments Production Storefront

## 1. Empty Cart Checkout Invariant
- The checkout page and order APIs must **NEVER** permit placing an order with 0 items.
- **Frontend**: If cart count is 0, disable checkout buttons, display an empty bag call-to-action ("SHOP NOW"), and prevent form submission.
- **Backend**: In order placement endpoints (`POST /api/orders`, `POST /api/checkout/create-order`), validate that `items` is a non-empty array with `quantity > 0`. If empty, reject with `HTTP 400 Bad Request`.

## 2. Database Primary Key & Cache Invalidation Invariant
- When synchronizing local stores with external relational databases (e.g., Supabase PostgreSQL), the system must immediately adopt the persisted database UUID/ID for the entity.
- Memory cache timestamps (`memoryProductsLastFetch`, `memoryOrdersLastFetch`) must be recorded **after** network persistence succeeds to ensure consistency across cache TTL expirations.
- Deletions must safely handle UUIDs and cascade cleanly without calling unsupported query methods.

## 3. Storefront Feature Parity & Cleanliness
- Never retain mock or unsupported features (such as Gift Cards or third-party bundle scripts) unless explicitly requested.
- Product catalog count must reflect genuine streetwear drops (no mock items).

## 4. Dual Product Imagery Standard
- Every apparel product must support both a Primary Image (flat-lay / studio cutout) and a Hover Image (model wearing the garment).
- Admin product forms must provide dedicated selectors for both images.
- Storefront product cards must render both images with a smooth hover cross-dissolve.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:
- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS.

### Constraints:
- All projects share a single AWS Region determined by the user's contact address (`ap-southeast-2`). Resources cannot be created in other Regions.
- MUST create all Regional resources in the project's assigned Region (`ap-southeast-2`).
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings.
<!-- END AWS Agent Toolkit rules -->

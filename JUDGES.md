# Guardian Wallet: Astra — judge quick start

**Try the hosted application:** <https://preview-95c94201191f7206.up.railway.app/review>

| Review task | Link |
| --- | --- |
| Try an isolated wallet and database purchase | [Interactive reviewer](https://preview-95c94201191f7206.up.railway.app/review) |
| Inspect recorded public receipts and evaluations | [Evidence page](https://preview-95c94201191f7206.up.railway.app/evidence) |
| Read the source | [GitHub main branch](https://github.com/farisal123uy/LombaGoestoChina/tree/main) |
| Read the technical, deployment and security documents | [Submission index](submission/README.md) |
| Watch the demo | [Demo_Project.mp4](submission/Demo_Project.mp4) |
| Watch the presentation | [Vidio_Presentation.mp4](submission/Vidio_Presentation.mp4) |
| Open the presentation deck | [11-slide PPTX](submission/04-Guardian-Wallet-Astra-Presentation.pptx) |

## Try the application

No MetaMask, personal funds, local installation or reviewer-owned AI account is required.
Use the **private reviewer access link/code supplied by the team with the submission**.
The public repository does not contain that code.

1. Open the reviewer link and choose **Start private review workspace**. Allow up to
   two minutes for wallet, contracts and database initialization.
2. In **Your wallet, with Astra**, inspect the available assets, budget and policy.
3. Enter this instruction and choose **Ask wallet assistant**:

   > Rent a 1 MB database for 1 hour. Pay only the authenticated catalog invoice
   > within my existing wallet policy.

4. Review the authenticated invoice and policy checks. Choose **Queue reviewed
   payments**, then **Start agent** if scheduling is paused.
5. Wait for **completed**. Select the task to inspect the escrow lock/release receipts
   and signed service delivery.
6. Choose **Verify database probe**, then enter a database key/value and choose
   **Write & read back** to try the delivered service.
7. Choose **Close workspace** when finished so the next reviewer can start.

The host currently allows one active workspace. Each session lasts 15 minutes.
If the slot is occupied, wait for its owner to close it or for expiry. A visible
rate-limit response includes a retry delay; retry the same request after that delay.
The [full reviewer guide](docs/REVIEWER_GUIDE.md) explains the controls and recovery.

## What the results mean

- The hosted reviewer calls real **GPT-OSS 120B through Groq** and executes actual
  Kernel/EntryPoint/Guardian contracts on an **isolated Base Sepolia fork**.
- Reviewer balances and transactions are disposable test assets. Their hashes are
  fork-local; historical public Base Sepolia receipts are labeled separately on the evidence page.
- **Completed** means payment/escrow and signed delivery/probe were verified at that
  time. Closing or expiring the workspace also discards its test database.
- The source on `main` retains the selected current UI/UX and the verified runtime
  baseline described in [frontend integration](docs/FRONTEND_INTEGRATION.md).
- PPTX and MP4 materials are team-maintained. GitHub stores the two MP4 files using
  Git LFS; choose the file's download/raw action or use `git lfs pull` after cloning.

For local reproduction, use the [README](README.md) and
[source, deployment and test guide](submission/02-source-code-deployment-and-tests.md).
The [October 20 release verification](docs/evidence/main-release-acceptance.json) records
the 156-test regression, successful public browser workflow and three China readiness probes.

# OCVS Single-Stack Configuration

The files in this folder are generated snapshots from `gen/workload-extensions/ocvs/single-stack/`.

This is a complete single-stack deployment of One-OE, Hub E, and one production OCVS platform. It does not require a separately deployed landing zone. Use [OCI Landing Zones Orchestrator v2.1.3](https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator/releases/tag/v2.1.3) and provide the files from a customer-controlled private source.

## Configuration Files

| File | Purpose |
| --- | --- |
| [ocvs_identity.json](./ocvs_identity.json) | Complete One-OE IAM configuration plus OCVS compartments, groups, and policies. |
| [ocvs_network.json](./ocvs_network.json) | Hub E and OCVS network configuration, including the OCVS VCN, provisioning subnet, route tables, NSGs, gateways, and DRG attachment. |
| [ocvs_governance.json](./ocvs_governance.json) | One-OE governance and tagging configuration. |
| [ocvs.json](./ocvs.json) | OCVS SDDC management cluster configuration. |

The folder also contains the generated CIS level 1 and level 2 security and observability files, including their staged `*_pre.json` inputs.

## Deployment

Follow the standard [Terraform deployment guide](/commons/content/terraform.md) with the orchestrator `rms-facade` root module. Supply `ocvs_identity.json`, `ocvs_network.json`, `ocvs_governance.json`, and `ocvs.json`; select the CIS security and observability pair required for the deployment.

Do not hand-edit generated snapshots as source. Change the Jsonnet profile and regenerate the published artifacts instead.

# License

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

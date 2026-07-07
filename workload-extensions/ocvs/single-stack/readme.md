# OCVS Single-Stack Configuration

The files in this folder are generated snapshots from `gen/workload-extensions/ocvs/single-stack/`.

These are extension-only inputs, not a complete landing zone. In a single-stack deployment, combine them with One-OE foundation and Hub E inputs that define `CMP-LZ-PROD-PLATFORM-KEY`, `CMP-LZ-PROD-NETWORK-KEY`, `DRG-FRA-LZ-HUB-KEY`, and `DRGRT-FRA-LZ-SPOKES-KEY`. When adding OCVS to an existing stack, provide the equivalent compartment and network dependency outputs. For a complete customized landing zone file set, use the Blueprint Factory config-driven path.

| File | Purpose |
| --- | --- |
| [identity.auto.tfvars.json](./identity.auto.tfvars.json) | Creates the OCVS platform compartment, admin group, and OCVS administration policies. |
| [network.auto.tfvars.json](./network.auto.tfvars.json) | Creates the OCVS platform VCN, provisioning subnet, route tables, network security groups, service gateway, and DRG attachment reference. |
| [ocvs.auto.tfvars.json](./ocvs.auto.tfvars.json) | Emits the orchestrator root variable `ocvs_configuration` for one SDDC management cluster. |

## OCVS Workload Configuration

`ocvs.auto.tfvars.json` includes:

- `default_compartment_id`
- `default_ssh_authorized_keys`
- one SDDC cluster definition
- logical keys for the generated VCN, provisioning subnet, OCVS VLAN route tables, and OCVS VLAN network security groups

The generated network uses logical resource keys resolved by [OCI Landing Zones Orchestrator v2.1.3](https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator/releases/tag/v2.1.3). Do not hand-edit generated snapshots as source. Change the Jsonnet profile or use the Blueprint Factory config-driven path instead.

For customized deployments, use the [Blueprint Factory](../../../addons/oci-lz-blueprint-factory/README.md) and deploy the generated file set from a customer-controlled private source.

Use Orchestrator v2.1.3 for direct OCVS deployment. It exposes `ocvs_configuration`, includes generated route tables in `network_dependency`, and translates route table and network security group dependencies for OCVS v1.1.0. The v2.1.3 contract has passed `terraform validate`; a Terraform plan and OCVS apply have not been run by this repository.

These files do not prove OCI capacity, host shape availability, VMware software availability, quota, or a successful OCVS apply.

# License

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

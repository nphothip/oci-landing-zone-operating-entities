# OCVS Landing Zone Extension

The OCVS extension artifacts in this directory are generated from Jsonnet source under `gen/workload-extensions/ocvs/`.

Use the [Blueprint Factory](../../addons/oci-lz-blueprint-factory/README.md) for customized OCVS deployments. The config extension type is `ocvs_simple`; see [config-driven.md](./config-driven.md) for OCVS-specific parameters. Published snapshots in this directory are reference artifacts. Customer deployments should use generated outputs staged in a customer-controlled private source.

Use [OCI Landing Zones Orchestrator v2.1.3](https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator/releases/tag/v2.1.3) with the generated OCVS files. This release accepts `ocvs_configuration`, exports generated route tables as network dependencies, and translates route table and network security group dependencies for the OCVS module.

## Published Artifacts

| Artifact | Purpose |
| --- | --- |
| [Single stack](./single-stack/readme.md) | Generated add-on IAM, network, and `ocvs_configuration` inputs for one OCVS platform, to be combined with One-OE foundation and hub inputs. |
| [Config driven](./config-driven.md) | OCVS-specific Blueprint Factory parameters and validation notes. |
| [Optional load balancer subnet](./3_lb_optional/README.md) | Manual optional post-deployment guidance retained from the existing extension. |

## Validation Boundary

The generated files validate Jsonnet structure and generator contracts. The Orchestrator v2.1.3 contract has also passed `terraform validate`. This does not prove OCI service capacity, host shape availability, VMware software availability, quota, a successful Terraform plan, or a successful OCVS apply.

# License

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

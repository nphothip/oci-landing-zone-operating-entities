# ADB-S@Azure Workload Extension - Single-Stack Deployment <!-- omit from toc -->

## **1. Summary**

<table>
  <tbody>
    <tr>
      <td><strong>NAME</strong></td>
      <td>Oracle Database@Azure ADB-S Workload Use Case (Single-Stack)</td>
    </tr>
    <tr>
      <td><strong>OBJECTIVE</strong></td>
      <td>Deploy an OD@Azure delegated VNet and one Autonomous Database Serverless database through the Orchestrator.</td>
    </tr>
    <tr>
      <td><strong>TARGET RESOURCES</strong></td>
      <td>Azure virtual network with Oracle Database@Azure delegated subnet and Azure Autonomous Database Serverless.</td>
    </tr>
  </tbody>
</table>

&nbsp;

## **2. Architecture Overview**

This single-stack example implements **WUC1 | ADB-S@Azure Platform** from the OD@Azure use cases document. The workload creates an Oracle Database@Azure network attachment target and one Autonomous Database Serverless database from the Orchestrator using `azure_oracle_database_configuration`.

The OD@Azure workload extension documentation states that OD@Azure automation creates a basic landing zone during account linking. For this WUC1 example, the checked-in Orchestrator configuration only creates the OD@Azure workload resources. Default Azure RBAC groups, OCI replicated groups, and the OCI policies created during Azure account linking are documented in the use-case guide and are not created by this JSON configuration.

<p align="center">
<img src="../../content/adb-s_azure_wuc1.jpg" width="1000" height="auto">
</p>

&nbsp;

## **3. Architecture Components**

| JSON configuration | Configuration-defined components | Resources |
|:-|:-|:-|
| **ADB-S@Azure workload configuration**</br> [odb_azure_adbs_wuc1.json](odb_azure_adbs_wuc1.json) | • Azure virtual network with OD@Azure delegated subnet</br> • Azure Autonomous Database Serverless database | `ODB-AZURE-ADBS-VNET-01` creates `vnet-odbaa-adbs` with delegated subnet `snet-odbaa-adbs-delegated`.</br></br>`ODB-AZURE-ADBS-01` creates `adbs-odbaa-wuc1` and resolves its network from `vmc_network_key: ODB-AZURE-ADBS-VNET-01` and `delegated_subnet_key: delegated`. |

The configuration uses the Orchestrator OD@Azure family:

- `azure_oracle_database_configuration.vmc_networks_configuration` uses `terraform-oci-multicloud-azure//modules/azure-vnet-subnet`.
- `azure_oracle_database_configuration.autonomous_databases_configuration` uses `terraform-oci-multicloud-azure//modules/azure-oracle-adbs`.

This WUC1 example does not use `cloud_exadata_database_configuration` or `autonomous_databases_configuration` from `terraform-oci-modules-exadata`, because the local WUC1 ADB-S@Azure design maps to the Azure Autonomous Database Serverless resource in `azure_oracle_database_configuration`.

&nbsp;

## **4. Deployment Steps**

<table>
  <thead>
    <tr>
      <th>USE CASE</th>
      <th>1</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Description</td>
      <td><a href="../../odb-azure_use_cases/readme.md/#21-adb-sazure-platform">ADB-S@Azure Platform</a></td>
      <td>Deploys a new OD@Azure delegated VNet and one Autonomous Database Serverless database.</td>
    </tr>
    <tr>
      <td>Terraform CLI</td>
      <td>Use the same configuration file with Terraform CLI.</td>
      <td>Replace the placeholder Azure resource group names, region, address ranges, database name, and <code>admin_password</code> before applying. Azure authentication for the <code>azurerm</code> and <code>azapi</code> providers must be available to Terraform. The ADB-S module also uses Azure CLI to wait for the database lifecycle state. OCI authentication is still required by the Orchestrator provider configuration. For Terraform CLI prerequisites, see <a href="../../../../commons/content/terraform.md">Run with Terraform CLI</a>.</td>
    </tr>
  </tbody>
</table>

&nbsp;

Terraform CLI example:

```bash
terraform -chdir=terraform-oci-modules-orchestrator init

terraform -chdir=terraform-oci-modules-orchestrator plan \
  -var-file=../oci-landing-zone-operating-entities/commons/content/oci-credentials.tfvars.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc1/single-stack/odb_azure_adbs_wuc1.json \
  -var='output_path=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc1/single-stack'

terraform -chdir=terraform-oci-modules-orchestrator apply \
  -var-file=../oci-landing-zone-operating-entities/commons/content/oci-credentials.tfvars.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc1/single-stack/odb_azure_adbs_wuc1.json \
  -var='output_path=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc1/single-stack'
```

&nbsp;

## **5. Expected Output**

When `output_path` is set, the Orchestrator writes:

| Output file | Contents |
| --- | --- |
| `azure_oracle_database_output.json` | IDs and properties for the created OD@Azure VNet and Autonomous Database resources. |

&nbsp;

# License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

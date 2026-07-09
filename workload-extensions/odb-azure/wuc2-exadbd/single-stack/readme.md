# ExaDB-D@Azure Workload Extension - Single-Stack Deployment <!-- omit from toc -->

## **1. Summary**

<table>
  <tbody>
    <tr>
      <td><strong>NAME</strong></td>
      <td>Oracle Database@Azure ExaDB-D Workload Use Case (Single-Stack)</td>
    </tr>
    <tr>
      <td><strong>OBJECTIVE</strong></td>
      <td>Deploy an OD@Azure delegated VNet, Exadata Infrastructure, VM Cluster, Oracle Home, CDB, and PDB through the Orchestrator.</td>
    </tr>
    <tr>
      <td><strong>TARGET RESOURCES</strong></td>
      <td>Azure virtual network with Oracle Database@Azure delegated subnet, Exadata Infrastructure, VM Cluster, Oracle Home, Container Database, and Pluggable Database.</td>
    </tr>
  </tbody>
</table>

&nbsp;

## **2. Architecture Overview**

This single-stack example implements **WUC2 | ExaDB-D@Azure Platform** from the OD@Azure use cases document. The workload creates the OD@Azure network and ExaDB-D platform resources from the Orchestrator, then creates one Oracle Home, one Container Database, and one Pluggable Database over the VM Cluster created in the same stack.

The OD@Azure use-case document states that Exadata Infrastructure is a shared platform resource, while regular VM Clusters and their Oracle Homes, CDBs, and PDBs are deployed within the same ExaDB-D OCI subscription compartment. This JSON keeps those resources in one Orchestrator input file so the VM Cluster key can be used by the Oracle Home configuration.

Default Azure RBAC groups, OCI replicated groups, and the OCI policies created during Azure account linking are documented in the use-case guide and are not created by this JSON configuration.

<p align="center">
<img src="../../content/exadb-d_azure_wuc2.jpg" width="1000" height="auto">
</p>

&nbsp;

## **3. Architecture Components**

| JSON configuration | Configuration-defined components | Resources |
|:-|:-|:-|
| **ExaDB-D@Azure workload configuration**</br> [odb_azure_exadb_d_wuc2.json](odb_azure_exadb_d_wuc2.json) | • Azure virtual network with OD@Azure delegated subnet</br> • Azure Oracle Exadata Infrastructure</br> • Azure Oracle VM Cluster</br> • Oracle Home</br> • Container Database</br> • Pluggable Database | `ODB-AZURE-EXADB-VNET-01` creates `vnet-odbaa-exadb` with delegated subnet `snet-odbaa-exadb-delegated`.</br></br>`ODB-AZURE-EXAINFRA-01` creates `exa-infra-odbaa-wuc2`.</br></br>`ODB-AZURE-VMCLUSTER-01` creates `vmcwuc2` and resolves its network and Exadata Infrastructure by key.</br></br>`DBHOME-WUC2-01`, `CDB-WUC2-01`, and `PDB-WUC2-01` create the database layer over the VM Cluster. |

The configuration uses two Orchestrator families:

- `azure_oracle_database_configuration.vmc_networks_configuration` uses `terraform-oci-multicloud-azure//modules/azure-vnet-subnet`.
- `azure_oracle_database_configuration.exadata_infrastructures_configuration` uses `terraform-oci-multicloud-azure//modules/azurerm-ora-exadata-infra`.
- `azure_oracle_database_configuration.vm_clusters_configuration` uses `terraform-oci-multicloud-azure//modules/azurerm-ora-exadata-vmc`.
- `cloud_exadata_database_configuration.cloud_db_homes_configuration`, `databases_configuration`, and `pluggable_databases_configuration` use `terraform-oci-modules-exadata//exadata-database`.

The Oracle Home configuration uses `vm_cluster_id: ODB-AZURE-VMCLUSTER-01`. The Orchestrator resolves that key to the VM Cluster OCI OCID before calling the Exadata database module.

&nbsp;

## **4. Deployment Steps**

<table>
  <thead>
    <tr>
      <th>USE CASE</th>
      <th>2</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Description</td>
      <td><a href="../../odb-azure_use_cases/readme.md/#22-exadb-dazure-platform">ExaDB-D@Azure Platform</a></td>
      <td>Deploys a new OD@Azure delegated VNet, Exadata Infrastructure, VM Cluster, Oracle Home, CDB, and PDB.</td>
    </tr>
    <tr>
      <td>Terraform CLI</td>
      <td>Use the same configuration file with Terraform CLI.</td>
      <td>Replace the placeholder Azure resource group names, region, address ranges, customer contact email, SSH public key, database names, and passwords before applying. Azure authentication for the <code>azurerm</code> provider must be available to Terraform. OCI authentication is still required by the Orchestrator provider configuration. For Terraform CLI prerequisites, see <a href="../../../../commons/content/terraform.md">Run with Terraform CLI</a>.</td>
    </tr>
  </tbody>
</table>

&nbsp;

Terraform CLI example:

```bash
terraform -chdir=terraform-oci-modules-orchestrator init

terraform -chdir=terraform-oci-modules-orchestrator plan \
  -var-file=../oci-landing-zone-operating-entities/commons/content/oci-credentials.tfvars.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc2/single-stack/odb_azure_exadb_d_wuc2.json \
  -var='output_path=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc2/single-stack'

terraform -chdir=terraform-oci-modules-orchestrator apply \
  -var-file=../oci-landing-zone-operating-entities/commons/content/oci-credentials.tfvars.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc2/single-stack/odb_azure_exadb_d_wuc2.json \
  -var='output_path=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/wuc2/single-stack'
```

&nbsp;

## **5. Expected Outputs**

When `output_path` is set, the Orchestrator writes:

| Output file | Contents |
| --- | --- |
| `azure_oracle_database_output.json` | IDs and OCI properties for the created OD@Azure VNet, Exadata Infrastructure, and VM Cluster resources. |
| `cloud_exadata_database_output.json` | IDs for the Oracle Home, Container Database, and Pluggable Database resources. |

&nbsp;

# License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

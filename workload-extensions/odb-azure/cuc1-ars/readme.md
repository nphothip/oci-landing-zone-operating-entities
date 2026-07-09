# Oracle Database@Azure CUC1 - Autonomous Recovery Service <!-- omit from toc -->

## **1. Summary**

<table>
  <tbody>
    <tr>
      <td><strong>NAME</strong></td>
      <td>Oracle Database@Azure Common Use Case 1 - Autonomous Recovery Service</td>
    </tr>
    <tr>
      <td><strong>OBJECTIVE</strong></td>
      <td>Prepare Oracle Database@Azure databases to use OCI Database Autonomous Recovery Service (ARS) for backups.</td>
    </tr>
    <tr>
      <td><strong>TARGET RESOURCES</strong></td>
      <td>OCI IAM policies, OCI network security rules in the OD@Azure shadow VCN, Recovery Service monitoring alarms, and the desired ARS service objects.</td>
    </tr>
  </tbody>
</table>

&nbsp;

## **2. Architecture Overview**

This common use case implements **CUC1 | Autonomous Recovery Service** from the OD@Azure use cases document. ARS is an OCI service used by Oracle Database@Azure databases through the Oracle-managed multicloud connectivity. The database VCN must expose a private Recovery Service subnet and allow backup traffic to the Recovery Service private endpoints.

For OD@Azure, the subnet choice depends on the database platform:

- **ADB-S@Azure:** use the client subnet in the OD@Azure shadow VCN.
- **ExaDB-D@Azure:** use the backup subnet in the OD@Azure shadow VCN.

Oracle ARS documentation requires TCP ports `2484` and `8005` for Recovery Service traffic and recommends a /24 IPv4-only private subnet for multicloud databases. Microsoft's Oracle.Database `cloudVmClusters` resource exposes `backupSubnetCidr`, `nsgCidrs`, `subnetId`, and `vnetId`, which aligns with the CUC1 requirement to identify the Azure-created OCI shadow VCN, client subnet, backup subnet, and NSGs before registering the ARS subnet.

<p align="center">
<img src="../content/cuc1.jpg" width="1000" height="auto">
</p>

&nbsp;

## **3. Configuration Files**

| JSON configuration | Orchestrator status | Purpose |
|:-|:-|:-|
| [cuc1_ars_iam.json](cuc1_ars_iam.json) | Supported | Creates an ARS administrator group and Recovery Service policies for Oracle Database@Azure. |
| [cuc1_ars_network.json](cuc1_ars_network.json) | Supported with manual attachment | Creates dedicated ARS NSGs in an existing OD@Azure OCI shadow VCN through `network_configuration.inject_into_existing_vcns`. The workload-side NSG must be manually attached to the ExaDB-D VM Cluster or ADB-S after it is created. |
| [cuc1_ars_observability.json](cuc1_ars_observability.json) | Supported | Creates a notification topic and alarms for the `oci_recovery_service` metric namespace. |
| [cuc1_ars_recovery_service.json](cuc1_ars_recovery_service.json) | Supported by the updated Orchestrator | Creates the Recovery Service subnet registration and ARS protection policies through `autonomous_recovery_service_configuration`. |

&nbsp;

## **4. Required Inputs**

Replace the placeholder keys and OCIDs before use:

| Placeholder | Meaning |
| --- | --- |
| `CMP-ODBAA-ROOT-KEY` | Compartment containing the OD@Azure multicloud link resources or the target subscription-level compartment. |
| `CMP-ODBAA-NETWORK-KEY` | Compartment containing the OCI shadow VCN and subnets. |
| `CMP-ODBAA-DATABASE-KEY` | Compartment containing the OCI database resources. |
| `ODB-AZURE-SHADOW-VCN-KEY` | Existing OD@Azure OCI shadow VCN key from `network_dependency.network_resources.vcns`. |
| `ODB-AZURE-CLIENT-SUBNET-KEY` | Existing client subnet key from `network_dependency.network_resources.subnets`. Use this for ADB-S@Azure. |
| `ODB-AZURE-BACKUP-SUBNET-KEY` | Existing backup subnet key from `network_dependency.network_resources.subnets`. Use this for ExaDB-D@Azure. |
| `ODB-AZURE-ARS-SUBNET-CIDR` | CIDR of the subnet selected for the ARS private endpoint. Use the client subnet CIDR for ADB-S@Azure and the backup subnet CIDR for ExaDB-D@Azure. |
| `NSG-ODBAA-ARS-WORKLOAD` | Dedicated workload egress NSG created by [cuc1_ars_network.json](cuc1_ars_network.json). Manually attach this NSG to the ExaDB-D VM Cluster or ADB-S. |
| `NSG-ODBAA-ARS-RECOVERY` | Recovery Service NSG key created by [cuc1_ars_network.json](cuc1_ars_network.json), or an existing NSG key supplied through `network_dependency.network_security_groups`. |
| `ODBAA-ARS-BRONZE` / `ODBAA-ARS-SILVER` | ARS protection policy keys created by [cuc1_ars_recovery_service.json](cuc1_ars_recovery_service.json). These keys can be used as `dbrs_policy_id` in ExaDB-D CDB backup configuration. |

For ExaDB-D@Azure, the Azure VM Cluster output includes the OCI VM Cluster OCID, VCN OCID, and NSG OCID. Use those values to build the `network_dependency` file consumed by the CUC1 network stack.

&nbsp;

## **5. Deployment Notes**

Recommended order:

1. Apply [cuc1_ars_iam.json](cuc1_ars_iam.json) in the home region.
2. Apply [cuc1_ars_network.json](cuc1_ars_network.json) with a `network_dependency` file that contains the OD@Azure shadow VCN and target subnet keys.
3. Manually attach `NSG-ODBAA-ARS-WORKLOAD` to the target ExaDB-D VM Cluster or ADB-S. This NSG is intentionally separate from the OD@Azure control-plane-created NSGs, because those NSGs are created by service automation and are not managed by this stack. OD@Azure workloads can have up to five NSGs, so confirm an NSG slot is available before attachment.
4. Apply [cuc1_ars_recovery_service.json](cuc1_ars_recovery_service.json) to create the Recovery Service subnet registration and protection policies. Use `output_path` or `save_output` when a downstream database stack must consume `autonomous_recovery_service_output.json`.
5. Configure ExaDB-D CDB backups in `cloud_exadata_database_configuration.databases_configuration` with `backup_destination_details.type = "DBRS"` and `backup_destination_details.dbrs_policy_id` set to either an ARS protection policy OCID or a policy key such as `ODBAA-ARS-BRONZE`.
6. Apply [cuc1_ars_observability.json](cuc1_ars_observability.json) after protected databases emit `oci_recovery_service` metrics.

The workload NSG OCID is emitted in `network_output.json` under:

```text
network_resources.network_security_groups.NSG-ODBAA-ARS-WORKLOAD.id
```

Attach that NSG to the workload manually:

- **ExaDB-D@Azure:** add `NSG-ODBAA-ARS-WORKLOAD` to the VM Cluster NSG list, preserving the existing OD@Azure control-plane NSGs.
- **ADB-S@Azure:** add `NSG-ODBAA-ARS-WORKLOAD` to the ADB-S network access NSG list, preserving the existing OD@Azure control-plane NSGs.

Terraform CLI example for the IAM, network, Recovery Service, and observability files:

```bash
terraform -chdir=terraform-oci-modules-orchestrator plan \
  -var-file=../oci-landing-zone-operating-entities/commons/content/oci-credentials.tfvars.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/cuc1-ars/cuc1_ars_iam.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/cuc1-ars/cuc1_ars_network.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/cuc1-ars/cuc1_ars_recovery_service.json \
  -var-file=../oci-landing-zone-operating-entities/workload-extensions/odb-azure/cuc1-ars/cuc1_ars_observability.json \
  -var='network_dependency=../path/to/odbaa_network_output.json' \
  -var='output_path=../path/to/output'
```

The generated `autonomous_recovery_service_output.json` has this dependency shape:

```json
{
  "protection_policies": {
    "ODBAA-ARS-BRONZE": {
      "id": "ocid1.recoveryprotectionpolicy..."
    }
  },
  "recovery_service_subnets": {
    "ODBAA-ARS-SUBNET": {
      "id": "ocid1.recoveryservicesubnet..."
    }
  }
}
```

For a separate ExaDB-D database stack, pass that file as `recovery_service_dependency` and use the policy key in the CDB backup configuration:

```json
{
  "cloud_exadata_database_configuration": {
    "databases_configuration": {
      "CDB-WUC2-01": {
        "source": "NONE",
        "db_home_id": "DB-HOME-KEY-OR-OCID",
        "database": {
          "admin_password": "REPLACE-WITH-STRONG-PASSWORD",
          "db_name": "CDB1",
          "db_backup_config": {
            "auto_backup_enabled": true,
            "backup_deletion_policy": "DELETE_AFTER_RETENTION_PERIOD",
            "backup_destination_details": {
              "type": "DBRS",
              "dbrs_policy_id": "ODBAA-ARS-BRONZE"
            },
            "run_immediate_full_backup": true
          }
        }
      }
    }
  }
}
```

&nbsp;

## **6. References**

- [OD@Azure CUC1 use-case description](../odb-azure_use_cases/readme.md/#31-autonomous-recovery-service)
- [Oracle ARS onboarding checklist](https://docs.oracle.com/en-us/iaas/recovery-service/doc/getting-started-recovery-service.html)
- [Oracle ARS multicloud backup support](https://docs.oracle.com/en-us/iaas/recovery-service/doc/azure-multicloud-recoveryservice.html)
- [Oracle ARS metrics](https://docs.oracle.com/en-us/iaas/recovery-service/doc/available-recovery-service-metrics.html)
- [Microsoft Learn Oracle.Database/cloudVmClusters reference](https://learn.microsoft.com/en-us/azure/templates/oracle.database/cloudvmclusters)

&nbsp;

# License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

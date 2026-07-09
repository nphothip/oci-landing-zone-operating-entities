# OD@Azure WE Set-up <!-- omit from toc -->

## **Table of Contents** <!-- omit from toc -->

- [**1. Summary**](#1-summary)
- [**2. Design Overview**](#2-design-overview)
- [**3. Deployment Options**](#3-deployment-options)

&nbsp;

## **1. Summary**

Welcome to the OD@Azure Landing Zone Workload Extension (WE).

The OD@Azure Landing Zone Workload Extension is a secure cloud environment, designed with the best practices to simplify the on-boarding of OD@Azure workloads and enable the continuous operations of their cloud resources. This reference architecture provides an automated landing zone configuration.

&nbsp;

## **2. Design Overview**
This workload extension is slightly different to others present in this repository. OD@ automation run from the other CSP, creates automatically a Basic Landing Zone, which includes compartments, groups, and policies. Thus, these components would not be managed by users or by IaC, as they are part of the CSP Control Plane.

When it is needed to extend the functionality of OD@ workloads, it becomes necessary to create additional OCI resources (not created by the OD@ control plane automation), that needs to be correctly operated and governed. These are Common Use Cases (CUC).

We'll explain here what components are automatically managed and what others are created and managed.

This Workload Extension is compound of:

- **Workload Use Cases (WUCs).** OD@Azure Oracle Database Workload deployment, including its infrastructure requirements.
- **Common Use Cases (CUCs).** Common addons that every OD@ to include optional components for the workload, and that requires the existance of OCI Landing Zone components.

The extension covers two OD@Azure Workload Use Cases at this moment (WUCs):

1. **Use Case 1 (UC1): ADB-S@Azure:** Dedicated Autonomous AI Serverless database.
2. **Use Case 2 (UC2): ExaDB-D@Azure:**: Exadata Cloud Service infrastructure, including VM Clusters, CDBs and PDBs.

If you have not reviewed it yet, we recommend checking the [OD@Azure use cases section](./odb-azure_use_cases/readme.md) to better understand the available scenarios and identify the one that best fits your needs.

You can access, use and adapt to your needs the **draw.io design artifact** from [<img src="../../commons/images/icon_drawio.jpg" width="20"> ](./design/OCI_Open_LZ_One-OE_ODAA_WL_Extension_Blueprint.drawio).

&nbsp;

## **3. Deployment Options**
&nbsp;

| When to use it / Use Case  | One-shot reference deployment | 
|---|---|
| Workload Use Case 1 (WUC1): ADB-S@Azure <br><br><img src="./content/adb-s_azure_wuc1.jpg" width="220"> | Use when deploying a new ODB Network and an Autonomous AI Serverless Database. Published Use Case 1 artifacts are available in the [single-stack](./wuc1/single-stack/readme.md) folder. |
| Workload Use Case 2 (WUC2): ExaDB-D@Azure<br><br><img src="./content/exadb-d_azure_wuc2.jpg" width="220"> | Use when deploying a new ODB Network and an Autonomous AI Serverless Database. Published Use Case 1 artifacts are available in the [single-stack](./wuc2/single-stack/readme.md) folder. |

&nbsp;

# License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

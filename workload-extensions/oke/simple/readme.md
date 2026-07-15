# **[OKE Landing Zone Extension](#)**   <!-- omit from toc -->
## **An OCI Open LZ [Workload Extensions](#) to Reduce Your Time-to-Production** <!-- omit from toc -->

 <img src="../../../commons/images/icon_oke.jpg" height="100">
&nbsp; 

## **1. Introduction**
Welcome to the **OKE Landing Zone Extension**.

The OKE Landing Zone Extension is a secure cloud environment, designed with the best practices to simplify the on-boarding of OKE workloads and enable the continuous operations of their cloud resources. This reference architecture provides an automated landing zone configuration.
&nbsp;

## **2. Design Overview**
This workload extension uses the [One-OE](https://github.com/oracle-quickstart/terraform-oci-open-lz/tree/master/blueprints/one-oe) Blueprint as the reference Landing Zone and guides the deployment of OKE on top of it. Extension consists of base infrastructure layer provisioning required OCI resources for deployment of OKE and OKE deployment itself.
&nbsp;

## **3. Deployment Options**

This OKE Landing Zone Extension provides **two quickstart approaches**, [single-stack](single-stack/) and [multi-stack](multi-stack/), to accommodate different use cases and architectural preferences. Both use the committed JSON configurations as-is and are based on **Hub E**.

For requirements outside the quickstart configurations, such as other hub models or additional OKE platforms, see [OKE generation options](oke-blueprint-factory.md).

The quickstarts create one production OKE platform by default.


### **Choosing the Right Approach**

| Consideration | [Single-stack](single-stack/) | [Multi-stack](multi-stack/) |
|---------------|-------------|--------------|
| **Use Case** | PoC, Exploration | Existing Hub E quickstart with separate lifecycle |
| **Hub Model** |  [Hub E (free)](../../../addons/oci-hub-models/hub_e/) |  Existing [Hub E](../../../addons/oci-hub-models/hub_e/) landing zone |
| **Routing Configuration** |  Automatic Hub route updates | OKE spoke attachment and Hub E route coordination |
| **Landing Zone** | Created together  | Already exists |
| **Deployment Steps** | Single deployment operation | Deploy LZ first, then OKE extension |
| **Terraform State** |  Combined (1 state) | Separate (2 states) |
| **Resource Lifecycle** | Coupled | Independent |
| **Complexity** | Self-contained | Requires key coordination across stacks |

The committed quickstart configurations are designed to be deployed as-is.


### Common Features (Both Approaches)

Both deployment options provide:
- **Automated Dependency Resolution**: Configuration keys instead of manual OCID lookups
- **CIS-Compliant OKE**: Using [CIS OKE module](https://github.com/oci-landing-zones/terraform-oci-modules-workloads/tree/main/cis-oke)
- **OKE CNI Network Mode**: VCN-native pod networking
- **Comprehensive NSG Configuration**: Control plane, workers, load balancers, and, for native networking, pods
- **Hub-and-Spoke Topology**: OKE VCN as spoke connected to Hub via DRG
- **Public workload ingress**: Kubernetes `Service` resources can create public OCI Load Balancers and Network Load Balancers in the prepared Hub subnet
- **Service Gateway**: Direct connectivity to OCI services

### Deployment Components

Both approaches deploy these resources:
- **IAM Configuration**: Compartments, groups, and policies for OKE
- **Network Infrastructure**: VCN, subnets, NSGs, route tables, service gateway, and DRG attachment
- **OKE Cluster**: Kubernetes cluster with VCN-native networking (v1.35.2)
- **Worker Nodes**: Compute instances for running workloads (VM.Standard.E5.Flex, Oracle Linux 9 OKE image)

### Operational and security notes

| Area | Important facts and required action |
| --- | --- |
| Kubernetes resources | This repository creates OCI infrastructure only. Install and operate namespaces, service accounts, cert-manager, ingress controllers, Services, ConfigMaps, RBAC, and admission policies through an approved Kubernetes delivery process. |
| Public ingress | The quickstarts enable public ingress. Anyone who can create or update a `LoadBalancer` Service can request a public endpoint. Use the included platform frontend NSG, set `oci.oraclecloud.com/security-rule-management-mode: "None"`, and reject the LB and NLB `initial-defined-tags-override` and `initial-freeform-tags-override` annotations. Validate LB and NLB creation, update, deletion, and platform tagging before production use. |
| TLS and certificates | OCI Network Load Balancer cannot terminate TLS with an OCI certificate; use TCP pass-through to an in-cluster TLS endpoint. OCI Load Balancer can terminate TLS with `tls-certificate-map` and an approved certificate in the owning OKE platform compartment. OKE can read and associate that certificate but cannot renew it. Use OCI-managed renewal, or a security-owned external pipeline for imported certificates. For Let's Encrypt, cert-manager renews automatically only when TLS terminates in Kubernetes. |
| IAM boundary | The quickstarts assume one cluster in the OKE platform compartment. The platform allowlist controls Hub access, and platform-tag equality isolates existing LB, NLB, and NSG resources. Public-, private-, and floating-IP permissions apply to every OKE cluster principal and must be monitored as a shared boundary. |

&nbsp;

## License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

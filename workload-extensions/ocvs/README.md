# **[OCVS Landing Zone Extension](#)**   <!-- omit from toc -->
## **An OCI Open LZ [Workload Extensions](#) to Reduce Your Time-to-Production**  <!-- omit from toc -->

 <img src="../../commons/images/icon_ocvs.jpg" height="50">

&nbsp;

## **1. Introduction**
Welcome to the **OCVS Landing Zone Extension**.

The OCVS Landing Zone (LZ) Extension is a secure cloud environment, designed with best practices to simplify the onboarding of OCVS workloads and enable the continuous operations of their cloud resources. This reference architecture provides an automated landing zone **configuration**.

&nbsp;

## **2. Design Overview**

This workload extension uses the [One-OE](/blueprints/one-oe/readme.md) Blueprint as the reference Landing Zone and deploys One-OE, Hub E, and OCVS in a single stack.


<img src="https://github.com/oracle-quickstart/terraform-oci-open-lz/blob/content/workload-extensions/ocvs/ocvs.gif" width="1000" height="auto">


&nbsp;

## **3. Deployment**

There are **two deployment steps** to provision the OCVS landing zone extension:
1. Deploy the complete [**OCVS single stack**](single-stack/readme.md) with [OCI Landing Zones Orchestrator v2.1.3](https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator/releases/tag/v2.1.3).
2. Optionally create a [Load Balancer (LB) subnet](3_lb_optional/README.md).


&nbsp;
# License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

# **[OCI Remote Peering Connections](#)**
## **An OCI Open LZ [Addon](#) for Remote Peering Across Regions and Tenancies using IaC**
&nbsp;
## **DRG Route Table Design and Sample JSON Files**

### 1. DRG Routing Design

The diagram below illustrates a sample routing setup for a multi-tenancy/multi-region RPC configuration. The left side represents Tenancy 1 with a firewall setup (HUB Model A), while the right side depicts the Tenancy 2 region setup without a firewall (HUB Model E).


<img src="../images/drg-routing.png" width="100%">

> [!NOTE]  
> The above diagram serves as a reference for designing DRG routing based on specific architecture requirements. Tenancy 1 and Tenancy 2 may follow different DRG routing styles, such as having firewalls on both sides, only in Tenancy 1, or a mix of different routing configurations.

&nbsp;
### 2. Sample JSON Configuration for RPC  

#### Configuration Details:  

- **Tenancy 1 Configuration**  
  - `tenancy1_iam.json` defines the compartment groups and policies required for RPC setup in Tenancy 1.  
  - `tenancy1_network.json` defines the Hub and Spoke network setup, including the Remote Peering Connection and associated route tables. The Tenancy 1 JSON configuration follows **OCI Open LZ - Hub A**.  
    - To learn more about **HUB Model A**, refer to the [OCI Open LZ - Hub A Documentation](https://github.com/oci-landing-zones/oci-landing-zone-operating-entities/tree/master/addons/oci-hub-models/hub_a).  

- **Tenancy 2 Configuration**  
  - `tenancy2_iam.json` defines the compartment groups and policies required for RPC setup in Tenancy 2.  
  - `tenancy2_network.json` defines the Hub and Spoke network setup, including the Remote Peering Connection and associated route tables. The Tenancy 2 JSON configuration follows **OCI Open LZ - Hub E**.  
    - To learn more about **HUB Model E**, refer to the [OCI Open LZ - Hub E Documentation](https://github.com/oci-landing-zones/oci-landing-zone-operating-entities/tree/master/addons/oci-hub-models/hub_e).  

> [!NOTE]  
> This addon runtime keeps only the RPC-specific Tenancy 1 and Tenancy 2 configuration files. It does not include full One-OE configs; these files are working reference sample configs to establish cross-tenancy RPC.


#### License
Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

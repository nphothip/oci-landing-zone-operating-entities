# Hub E Routing Notes <!-- omit from toc -->

The simple multi-stack OKE package is based on **Hub E**. It is a quickstart for adding one OKE platform VCN as a spoke to an existing Hub E landing zone.

## Hub E Assumptions

- The Hub E landing zone already exists.
- The Hub DRG key is `DRG-FRA-LZ-HUB-KEY` in the Frankfurt configuration.
- The Hub DRG spokes route table key is `DRGRT-FRA-LZ-SPOKES-KEY`.
- The OKE platform VCN is `10.0.80.0/20`.
- The OKE platform VCN uses its own NAT gateway and service gateway.
- The quickstart enables OKE-created public OCI Load Balancers and Network Load Balancers in the Hub LB subnet and injects a platform-tagged frontend NSG into the existing Hub VCN through `network_dependency`. It does not create a Terraform-managed hub-level OCI L7 Load Balancer. Apply the shared [operational and security notes](../readme.md#operational-and-security-notes).

## Multi-Stack Network Output

The generated `oke_network.json` contains only the OKE platform network category and injects an OKE VCN attachment into the existing Hub DRG. It does not publish Hub A firewall route-table updates or a hub-level OCI L7 Load Balancer.

The OKE VCN attachment uses:

```text
DRG: DRG-FRA-LZ-HUB-KEY
DRG route table: DRGRT-FRA-LZ-SPOKES-KEY
Attached VCN: VCN-FRA-LZ-PROD-PLATFORM-OKE-KEY
OKE VCN CIDR: 10.0.80.0/20
```

&nbsp;

# License <!-- omit from toc -->

Copyright (c) 2026 Oracle and/or its affiliates.

Licensed under the Universal Permissive License (UPL), Version 1.0.

See [LICENSE](/LICENSE.txt) for more details.

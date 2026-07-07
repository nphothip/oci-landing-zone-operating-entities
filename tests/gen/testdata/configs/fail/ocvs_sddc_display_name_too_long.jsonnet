// OCI OCVS SDDC names are limited to 16 characters
// error_contains: config_params.cluster.sddc_display_name must be 16 characters or less
{
  hub: { kind: 'hub_e', network: { vcn: '10.0.0.0/21' } },
  environments: {
    prod: {
      platforms: {
        ocvs: {
          network: { vcn: '10.0.80.0/21' },
          extension: {
            type: 'ocvs_simple',
            params: {
              ssh_authorized_keys: 'ssh-rsa AAAAocvsfixture',
              cluster: {
                service_label: 'prod-ocvs',
                sddc_display_name: 'abcdefghijklmnopq',
                vmware_software_version: '7.0 update 3',
                compute_availability_domain: '1',
                esxi_hosts_count: 3,
                vsphere_type: 'MANAGEMENT',
                initial_host_ocpu_count: 52,
                initial_host_shape_name: 'BM.DenseIO2.52',
              },
            },
          },
        },
      },
    },
  },
}

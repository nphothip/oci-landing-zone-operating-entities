import type { TemplateDefinition, TemplateId } from "@/lib/domain/types";
import { webAppTemplate } from "./web-app";
import { chatbotTemplate } from "./chatbot";
import { drTemplate } from "./dr";
import { backupTemplate } from "./backup";
import { erpTemplate } from "./erp";
import { migrationTemplate } from "./migration";
import { analyticsTemplate } from "./analytics";
import { devtestTemplate } from "./devtest";
import { okePlatformTemplate } from "./oke-platform";
import { ecommerceTemplate } from "./ecommerce";
import { fileserverTemplate } from "./fileserver";
import { vdiTemplate } from "./vdi";
import { serverlessTemplate } from "./serverless";
import { streamingTemplate } from "./streaming";
import { enterpriseLzTemplate } from "./enterprise-lz";

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  enterprise_lz: enterpriseLzTemplate,
  web_app: webAppTemplate,
  ecommerce: ecommerceTemplate,
  erp: erpTemplate,
  migration: migrationTemplate,
  chatbot: chatbotTemplate,
  analytics: analyticsTemplate,
  streaming: streamingTemplate,
  serverless: serverlessTemplate,
  oke_platform: okePlatformTemplate,
  fileserver: fileserverTemplate,
  vdi: vdiTemplate,
  devtest: devtestTemplate,
  dr: drTemplate,
  backup: backupTemplate,
};

/** Display order for the template gallery (most common SME deals first).
 *  enterprise_lz is NOT in the gallery — it has its own Advanced mode tab. */
export const TEMPLATE_LIST: TemplateDefinition[] = [
  webAppTemplate,
  ecommerceTemplate,
  erpTemplate,
  migrationTemplate,
  chatbotTemplate,
  analyticsTemplate,
  streamingTemplate,
  serverlessTemplate,
  okePlatformTemplate,
  fileserverTemplate,
  vdiTemplate,
  devtestTemplate,
  drTemplate,
  backupTemplate,
];

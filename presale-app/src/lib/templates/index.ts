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

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  web_app: webAppTemplate,
  erp: erpTemplate,
  migration: migrationTemplate,
  chatbot: chatbotTemplate,
  analytics: analyticsTemplate,
  oke_platform: okePlatformTemplate,
  devtest: devtestTemplate,
  dr: drTemplate,
  backup: backupTemplate,
};

/** Display order for the template gallery (most common SME deals first). */
export const TEMPLATE_LIST: TemplateDefinition[] = [
  webAppTemplate,
  erpTemplate,
  migrationTemplate,
  chatbotTemplate,
  analyticsTemplate,
  okePlatformTemplate,
  devtestTemplate,
  drTemplate,
  backupTemplate,
];

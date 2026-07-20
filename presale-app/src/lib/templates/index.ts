import type { TemplateDefinition, TemplateId } from "@/lib/domain/types";
import { webAppTemplate } from "./web-app";
import { chatbotTemplate } from "./chatbot";
import { drTemplate } from "./dr";
import { backupTemplate } from "./backup";

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  web_app: webAppTemplate,
  chatbot: chatbotTemplate,
  dr: drTemplate,
  backup: backupTemplate,
};

export const TEMPLATE_LIST: TemplateDefinition[] = [
  webAppTemplate,
  chatbotTemplate,
  drTemplate,
  backupTemplate,
];

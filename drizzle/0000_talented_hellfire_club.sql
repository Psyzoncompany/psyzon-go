CREATE TABLE `ai_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`tool` text NOT NULL,
	`action` text NOT NULL,
	`entity` text,
	`entity_id` text,
	`arguments_sanitized` text DEFAULT '{}' NOT NULL,
	`previous_value` text,
	`new_value` text,
	`status` text NOT NULL,
	`risk_level` integer NOT NULL,
	`requires_confirmation` integer DEFAULT false NOT NULL,
	`approved_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_audit_user_created_idx` ON `ai_audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`tool` text NOT NULL,
	`arguments_json` text NOT NULL,
	`preview_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_confirmations_user_status_idx` ON `ai_confirmations` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_conversations_user_updated_idx` ON `ai_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`tool_names` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_messages_conversation_created_idx` ON `ai_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_rate_limits` (
	`user_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `ai_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`permission_mode` text DEFAULT 'read_only' NOT NULL,
	`save_history` integer DEFAULT true NOT NULL,
	`show_dashboard_summary` integer DEFAULT true NOT NULL,
	`financial_analysis` integer DEFAULT true NOT NULL,
	`mercado_pago_enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `financial_reconciliation` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`system_transaction_id` text,
	`provider_payment_id` text,
	`status` text NOT NULL,
	`system_amount_cents` integer,
	`provider_amount_cents` integer,
	`difference_cents` integer,
	`confidence` text DEFAULT 'high' NOT NULL,
	`reason` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reconciliation_owner_status_idx` ON `financial_reconciliation` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `reconciliation_provider_payment_idx` ON `financial_reconciliation` (`provider_payment_id`);--> statement-breakpoint
CREATE TABLE `integration_events` (
	`event_key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`provider_entity_id` text,
	`action` text,
	`status` text NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `integration_events_owner_received_idx` ON `integration_events` (`owner_user_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `integration_sync_state` (
	`owner_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`last_synced_at` integer,
	`last_error` text,
	`records_checked` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`owner_user_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `mercado_pago_payments` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`external_reference` text,
	`description` text,
	`status` text NOT NULL,
	`status_detail` text,
	`amount_cents` integer NOT NULL,
	`net_amount_cents` integer,
	`fee_cents` integer,
	`payment_method` text,
	`date_created` text,
	`date_approved` text,
	`raw_summary_json` text DEFAULT '{}' NOT NULL,
	`last_synced_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mp_payments_owner_date_idx` ON `mercado_pago_payments` (`owner_user_id`,`date_created`);--> statement-breakpoint
CREATE INDEX `mp_payments_external_reference_idx` ON `mercado_pago_payments` (`external_reference`);
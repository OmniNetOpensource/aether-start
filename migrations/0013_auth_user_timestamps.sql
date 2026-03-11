ALTER TABLE `user` RENAME COLUMN `created_at` TO `registered_at`;
--> statement-breakpoint
ALTER TABLE `user` ADD COLUMN `last_login_at` integer;
--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `image`;

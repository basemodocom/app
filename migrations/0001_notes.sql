-- The notes example's table: each visitor's notes, under their X-Basemodo-Id.
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);

CREATE INDEX `notes_person_id` ON `notes` (`person_id`);

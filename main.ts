// General stuff
import semver from "semver";
import yargs from "yargs";
import path from "path";
import { Logger } from "./src/Logger";
import { MessageMap } from "./src/MessageMap";
import { Bridge, BridgeProperties } from "./src/bridgestuff/Bridge";
import { BridgeMap } from "./src/bridgestuff/BridgeMap";
import { Settings } from "./src/settings/Settings";
import { migrateSettingsToYAML } from "./src/migrateSettingsToYAML";
import jsYaml from "js-yaml";
import fs from "fs";
import R from "ramda";
import os from "os";

// Telegram stuff
import { Telegraf } from "telegraf";
import { setup as telegramSetup, TediTelegraf } from "./src/telegram2discord/setup";

// Discord stuff
import Discord from "discord.js";
import { setup as discordSetup } from "./src/discord2telegram/setup";

if (!semver.gte(process.version, "14.9.0")) {
	console.log(`TediCross requires at least nodejs 14.9. Your version is ${process.version}`);
	process.exit();
}

/*************
 * TediCross *
 *************/

// Get command line arguments if any
const args = yargs
	.alias("v", "version")
	.alias("h", "help")
	.option("config", {
		alias: "c",
		default: path.join(__dirname, "settings.yaml"),
		describe: "Specify path to settings file",
		type: "string"
	})
	.option("data-dir", {
		alias: "d",
		default: path.join(__dirname, "data"),
		describe: "Specify the path to the directory to store data in",
		type: "string"
	}).argv as Record<string, string | number>;

// Migrate the settings from JSON to YAML
const settingsPathJSON = path.join(__dirname, "settings.json");
const settingsPathYAML = args.config;
migrateSettingsToYAML(settingsPathJSON, settingsPathYAML);

// Get the settings
const rawSettingsObj = jsYaml.load(fs.readFileSync(settingsPathYAML, "utf-8"));

const settings = Settings.fromObj(rawSettingsObj);


// Initialize logger
const logger = new Logger(settings.debug);

// Write the settings back to the settings file if they have been modified
const newRawSettingsObj = settings.toObj();
if (R.not(R.equals(rawSettingsObj, newRawSettingsObj))) {
	// Turn it into notepad friendly YAML
	//TODO: Replaced safeDump with dump. It needs to be verified
	const yaml = jsYaml.dump(newRawSettingsObj).replace(/\n/g, "\r\n");

	try {
		fs.writeFileSync(settingsPathYAML, yaml);
	} catch (err: any) {
		if (err.code === "EACCES") {
			// The settings file is not writable. Give a warning
			logger.warn(
				"Changes to TediCross' settings have been introduced. Your settings file it not writable, so it could not be automatically updated. TediCross will still work, with the modified settings, but you will see this warning until you update your settings file"
			);

			// Write the settings to temp instead
			const tmpPath = path.join(os.tmpdir(), "tedicross-settings.yaml");
			try {
				fs.writeFileSync(tmpPath, yaml);
				logger.info(
					`The new settings file has instead been written to '${tmpPath}'. Copy it to its proper location to get rid of the warning`
				);
			} catch (err) {
				logger.warn(
					`An attempt was made to put the modified settings file at '${tmpPath}', but it could not be done. See the following error message`
				);
				logger.warn(err);
			}
		}
	}
}

// Create a Telegram bot
//@ts-ignore
const tgBot = new Telegraf(settings.telegram.token, { channelMode: true });

// Create a Discord bot
const dcBot = new Discord.Client();

// Create a message ID map
const messageMap = new MessageMap();

// Create the bridge map
const bridgeMap = new BridgeMap(settings.bridges.map((bridgeSettings: BridgeProperties) => new Bridge(bridgeSettings)));

/*********************
 * Set up the bridge *
 *********************/

discordSetup(logger, dcBot, tgBot, messageMap, bridgeMap, settings as any, args.dataDir as string);
telegramSetup(logger, tgBot as TediTelegraf, dcBot, messageMap, bridgeMap, settings);
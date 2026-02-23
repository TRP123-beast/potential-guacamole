#!/usr/bin/env node

/**
 * Session Fallback Manager
 * Manages multiple Chrome profiles for Broker Bay with automatic fallback
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Profile configurations
const PROFILES = [
    {
        name: 'Profile 1',
        path: '/home/saska-jr/.config/brokerbay-chrome-profile/Profile 1',
        priority: 1
    },
    {
        name: 'Default',
        path: '/home/saska-jr/.config/brokerbay-chrome-profile/Default',
        priority: 2
    }
];

async function checkProfileExists(profilePath) {
    try {
        const cookiesPath = path.join(profilePath, 'Cookies');
        await fs.access(cookiesPath);
        const stats = await fs.stat(cookiesPath);
        return {
            exists: true,
            size: stats.size,
            modified: stats.mtime
        };
    } catch {
        return { exists: false };
    }
}

async function getProfileStatus() {
    console.log('\n🔍 Checking available Chrome profiles...\n');

    const statuses = [];

    for (const profile of PROFILES) {
        const status = await checkProfileExists(profile.path);

        if (status.exists) {
            console.log(`✅ ${profile.name}`);
            console.log(`   Path: ${profile.path}`);
            console.log(`   Cookies: ${(status.size / 1024).toFixed(2)} KB`);
            console.log(`   Last Modified: ${status.modified.toLocaleString()}`);
            console.log(`   Priority: ${profile.priority}\n`);

            statuses.push({
                ...profile,
                ...status
            });
        } else {
            console.log(`❌ ${profile.name} - Not found\n`);
        }
    }

    return statuses.sort((a, b) => a.priority - b.priority);
}

async function copyProfile(source, destination) {
    console.log(`\n📋 Copying profile from ${source} to ${destination}...\n`);

    try {
        // Create destination if it doesn't exist
        await fs.mkdir(destination, { recursive: true });

        // Copy essential files
        const filesToCopy = [
            'Cookies',
            'Local Storage',
            'Session Storage',
            'Preferences',
            'Network',
            'IndexedDB'
        ];

        for (const file of filesToCopy) {
            const sourcePath = path.join(source, file);
            const destPath = path.join(destination, file);

            try {
                const stats = await fs.stat(sourcePath);

                if (stats.isDirectory()) {
                    // Copy directory recursively
                    await fs.cp(sourcePath, destPath, { recursive: true, force: true });
                    console.log(`   ✅ Copied directory: ${file}`);
                } else {
                    // Copy file
                    await fs.copyFile(sourcePath, destPath);
                    console.log(`   ✅ Copied file: ${file}`);
                }
            } catch (err) {
                console.log(`   ⚠️  Skipped ${file}: ${err.message}`);
            }
        }

        console.log('\n✅ Profile copy completed!\n');
        return true;
    } catch (error) {
        console.error(`\n❌ Error copying profile: ${error.message}\n`);
        return false;
    }
}

async function updateSessionMetadata(profilePath, profileName) {
    const metadataPath = path.join(path.dirname(profilePath), '.session-metadata.json');

    const metadata = {
        isValid: true,
        lastLogin: new Date().toISOString(),
        userEmail: process.env.BROKERBAY_USERNAME || process.env.USER_EMAIL || 'naheed.val@gmail.com',
        createdAt: new Date().toISOString(),
        sourceProfile: profileName,
        lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    await fs.chmod(metadataPath, 0o600);

    console.log(`✅ Updated session metadata: ${metadataPath}\n`);
    return metadata;
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('  🔄 BROKER BAY SESSION FALLBACK MANAGER');
    console.log('='.repeat(70) + '\n');

    // Get all available profiles
    const profiles = await getProfileStatus();

    if (profiles.length === 0) {
        console.log('❌ No Chrome profiles found!\n');
        console.log('Please log in to Broker Bay manually first.\n');
        process.exit(1);
    }

    // Use the highest priority profile (most recently modified)
    const sortedByDate = profiles.sort((a, b) => b.modified - a.modified);
    const sourceProfile = sortedByDate[0];

    console.log('='.repeat(70));
    console.log(`📌 Selected Profile: ${sourceProfile.name}`);
    console.log(`   Last Modified: ${sourceProfile.modified.toLocaleString()}`);
    console.log('='.repeat(70) + '\n');

    // Update session metadata
    await updateSessionMetadata(sourceProfile.path, sourceProfile.name);

    console.log('✅ Session fallback configured successfully!\n');
    console.log('📝 Your automation will now use this profile.\n');
    console.log('💡 To refresh the session, just log in to Broker Bay in Chrome,');
    console.log('   then run this script again.\n');
}

main().catch(console.error);

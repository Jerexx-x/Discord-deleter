const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let isRunning = false;
let statsTimer = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 850,
        height: 600,
        titleBarStyle: 'hidden',
        ...(process.platform !== 'darwin' ? { titleBarOverlay: { color: '#28282A', symbolColor: '#ffffffff', height: 30 } } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        trafficLightPosition: { x: 20, y: 14 },
        icon: nativeImage.createFromPath('./build/icon.png'),
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('minimize-window', () => mainWindow.minimize());

ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('close-window', () => mainWindow.close());

function log(message) {
    if (mainWindow) {
        mainWindow.webContents.send('log-update', message);
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startDeletion(config) {
    const { MODE, GUILD_ID, DM_ID, USER_ID, TOKEN } = config;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000;
    const PAGE_DELAY = 5000;
    const DELETE_DELAY = 1000;

    let offset = 0;
    let page = 1;
    let totalDeleted = 0;
    let totalMessages = 0;
    const startTime = Date.now();

    log('--- Deletion process started ---');

    if (!TOKEN) {
        log('[FATAL] Authorization Token is not provided.');
        log('--- Deletion process finished ---');
        isRunning = false;
        mainWindow.webContents.send('process-finished');
        return;
    }

    if(!USER_ID || USER_ID.length < 17 || USER_ID.length > 19 || isNaN(USER_ID)) {
        log('[FATAL] User ID is not provided.');
        log('--- Deletion process finished ---');
        isRunning = false;
        mainWindow.webContents.send('process-finished');
        return;
    }

    if (MODE === 'GUILD' && (!GUILD_ID || GUILD_ID.length < 17 || GUILD_ID.length > 19 || isNaN(GUILD_ID))) {
        log('[FATAL] Mode is "Guild", but Guild ID is not provided.');
        log('--- Deletion process finished ---');
        isRunning = false;
        mainWindow.webContents.send('process-finished');
        return;
    }

    if (MODE !== 'GUILD' && (!DM_ID || DM_ID.length < 17 || DM_ID.length > 19 || isNaN(DM_ID))) {
        log('[FATAL] Mode is "DM", but DM ID is not provided.');
        log('--- Deletion process finished ---');
        isRunning = false;
        mainWindow.webContents.send('process-finished');
        return;
    }

    const apiFetch = async (url, options) => {
        log(`[API] Requesting: ${options.method} ${url}`);
        return fetch(url, options);
    };

    statsTimer = setInterval(() => {
        mainWindow.webContents.send('stats-update', {
            deleted: totalDeleted,
            total: totalMessages,
            time: Date.now() - startTime
        });
    }, 1000);

    while (isRunning) {
        log(`\n> Searching for messages on page ${page} (offset: ${offset})...`);

        try {
            let searchURL;
            let searchOptions;

            if (MODE === 'GUILD') {
                searchURL = new URL(`https://discord.com/api/v10/guilds/${GUILD_ID}/messages/search`);
                searchURL.search = new URLSearchParams({
                    author_id: USER_ID,
                    sort_by: 'timestamp',
                    sort_order: 'asc',
                    offset: offset,
                    include_nsfw: true,
                });
                searchOptions = {
                    method: 'GET',
                    headers: { 'Authorization': TOKEN }
                };
            } else {
                searchURL = new URL(`https://discord.com/api/v10/channels/${DM_ID}/messages/search`);
                searchURL.search = new URLSearchParams({
                    author_id: USER_ID
                });
                searchOptions = {
                    method: 'GET',
                    headers: { 'Authorization': TOKEN },
                };
            }

            const searchResponse = await apiFetch(searchURL.toString(), searchOptions);

            if (!searchResponse.ok) {
                log(`[ERROR] Failed to search messages. Status: ${searchResponse.status}`);
                const errorBody = await searchResponse.text();
                log(`[ERROR] Body: ${errorBody}`);
                if (searchResponse.status === 403) {
                    log('[HINT] A 403 error in a guild often means the bot/user lacks "Read Message History" permissions.');
                }
                break;
            }

            const searchResult = await searchResponse.json();
            
            if (page === 1) {
                totalMessages = searchResult.total_results;
            }

            const messages = (searchResult.messages || []).map(group => group.find(msg => msg.hit)).filter(Boolean);

            if (messages.length === 0) {
                if (page === 1) log('> No messages found.');
                else log('> No more messages found.');
                break;
            }

            log(`> Found ${messages.length} messages. Starting deletion...`);

            for (const message of messages) {
                if (!isRunning) break;
                let success = false;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    if (!isRunning) break;
                    const deleteURL = `https://discord.com/api/v10/channels/${message.channel_id}/messages/${message.id}`;
                    const deleteResponse = await apiFetch(deleteURL, {
                        method: 'DELETE',
                        headers: { 'Authorization': TOKEN }
                    });

                    if (deleteResponse.ok) {
                        log(`[OK] Message ${message.id} deleted.`);
                        totalDeleted++;
                        success = true;
                        break;
                    } else if (deleteResponse.status === 429) {
                        const rateLimitData = await deleteResponse.json();
                        const retryAfter = rateLimitData.retry_after || 5;
                        log(`[WARN] Rate limited. Retrying in ${retryAfter.toFixed(1)}s... (Attempt ${attempt}/${MAX_RETRIES})`);
                        await sleep(retryAfter * 1000);
                    } else {
                        log(`[FAIL] Failed to delete ${message.id}. Status: ${deleteResponse.status}. (Attempt ${attempt}/${MAX_RETRIES})`);
                        await sleep(RETRY_DELAY);
                    }
                }

                if (!success && isRunning) {
                    log(`[FATAL] Could not delete message ${message.id} after ${MAX_RETRIES} attempts. Skipping.`);
                }
                if (!isRunning) break;
                await sleep(DELETE_DELAY);
            }
            if (!isRunning) break;

            log(`> Page ${page} cleared. Total deleted: ${totalDeleted}`);
            offset += messages.length;
            page++;
            log(`> Moving to the next page in ${PAGE_DELAY / 1000}s...`);
            await sleep(PAGE_DELAY);

        } catch (error) {
            log(`[FATAL SCRIPT ERROR] ${error.name}: ${error.message}`);
            break;
        }
    }

    if (statsTimer) clearInterval(statsTimer);

    mainWindow.webContents.send('stats-update', {
        deleted: totalDeleted,
        total: totalMessages,
        time: Date.now() - startTime
    });

    if (isRunning) {
        log('\n--- Deletion process finished ---');
    }

    isRunning = false;
    mainWindow.webContents.send('process-finished');
}

ipcMain.on('start-deletion', (event, config) => {
    if (isRunning) return;
    isRunning = true;
    startDeletion(config);
});

ipcMain.on('stop-deletion', () => {
    if (isRunning) {
        log('\n--- Stopping process... ---');
        isRunning = false;
        if (statsTimer) clearInterval(statsTimer);
    }
});
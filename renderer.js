document.addEventListener('DOMContentLoaded', () => {
    const welcomeScreen = document.getElementById('welcome-screen');
    const logWrapper = document.getElementById('log-wrapper');
    const logContainer = document.querySelector('.log-container');
    const titleBar = document.querySelector('.title-bar');

    const tokenInput = document.getElementById('token');
    const userIdInput = document.getElementById('userId');
    const modeSelect = document.getElementById('mode');
    const guildIdRow = document.getElementById('guild-id-row');
    const dmIdRow = document.getElementById('dm-id-row');
    const guildIdInput = document.getElementById('guildId');
    const dmIdInput = document.getElementById('dmId');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const logArea = document.getElementById('log');

    const statsDeleted = document.getElementById('stats-deleted');
    const statsTotal = document.getElementById('stats-total');
    const statsTime = document.getElementById('stats-time');

    if (window.api.getPlatform() === 'darwin') {
        titleBar.classList.add('mac');
    }

    const formInputs = [tokenInput, userIdInput, modeSelect, guildIdInput, dmIdInput];
    let customSelectDiv = null; 

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function resetStats() {
        statsDeleted.textContent = '0';
        statsTotal.textContent = '0';
        statsTime.textContent = '00:00';
    }

    function updateFormVisibility() {
        const isGuild = modeSelect.value === 'GUILD';
        guildIdRow.style.display = isGuild ? 'flex' : 'none';
        dmIdRow.style.display = isGuild ? 'none' : 'flex';
    }

    modeSelect.addEventListener('change', updateFormVisibility);
    updateFormVisibility();

    function setUiForRunning(running) {
        if (running) {
            formInputs.forEach(el => el.disabled = true);
            if (customSelectDiv) customSelectDiv.style.pointerEvents = 'none';
            startButton.classList.add('hidden');
            stopButton.classList.remove('hidden');
        } else {
            formInputs.forEach(el => el.disabled = false);
            if (customSelectDiv) customSelectDiv.style.pointerEvents = 'auto';
            startButton.classList.remove('hidden');
            stopButton.classList.add('hidden');
        }
    }

    startButton.addEventListener('click', () => {
        logArea.innerHTML = '';
        resetStats();
        welcomeScreen.classList.add('hidden');
        logWrapper.classList.remove('hidden');
        setUiForRunning(true);

        const config = {
            TOKEN: tokenInput.value,
            USER_ID: userIdInput.value,
            MODE: modeSelect.value,
            GUILD_ID: guildIdInput.value,
            DM_ID: dmIdInput.value,
        };
        window.api.startDeletion(config);
    });

    stopButton.addEventListener('click', () => {
        window.api.stopDeletion();
    });

    window.api.onLogUpdate(message => {
        const line = document.createElement('div');
        let messageClass = 'default';

        if (message.startsWith('[OK]')) messageClass = 'ok';
        else if (message.startsWith('[API]')) messageClass = 'api';
        else if (message.startsWith('[WARN]')) messageClass = 'warn';
        else if (message.startsWith('[ERROR]')) messageClass = 'error';
        else if (message.startsWith('[FATAL')) messageClass = 'fatal';
        else if (message.startsWith('---') || message.startsWith('>')) messageClass = 'info';
        
        line.className = `log-line ${messageClass}`;
        line.textContent = message;
        logArea.appendChild(line);

        logContainer.scrollTop = logContainer.scrollHeight;
    });

    window.api.onStatsUpdate(stats => {
        statsDeleted.textContent = stats.deleted;
        statsTotal.textContent = stats.total;
        statsTime.textContent = formatTime(stats.time);
    });

    window.api.onProcessFinished(() => {
        setUiForRunning(false);
    });

    function initializeCustomSelect(wrapper) {
        const nativeSelect = wrapper.querySelector("select");
        if (!nativeSelect) return;
        const options = nativeSelect.getElementsByTagName("option");

        const selectedDiv = document.createElement("DIV");
        selectedDiv.className = "select-selected";
        selectedDiv.innerHTML = nativeSelect.options[nativeSelect.selectedIndex].innerHTML;
        wrapper.appendChild(selectedDiv);
        customSelectDiv = selectedDiv;

        const optionsDiv = document.createElement("DIV");
        optionsDiv.className = "select-items select-hide";

        for (let j = 0; j < options.length; j++) {
            const optionItemDiv = document.createElement("DIV");
            optionItemDiv.innerHTML = options[j].innerHTML;

            if (j === nativeSelect.selectedIndex) {
                optionItemDiv.className = "same-as-selected";
            }

            optionItemDiv.addEventListener("click", function () {
                for (let i = 0; i < nativeSelect.length; i++) {
                    if (nativeSelect.options[i].innerHTML === this.innerHTML) {
                        nativeSelect.selectedIndex = i;
                        selectedDiv.innerHTML = this.innerHTML;

                        const currentlySelected = this.parentNode.getElementsByClassName("same-as-selected");
                        for (let k = 0; k < currentlySelected.length; k++) {
                            currentlySelected[k].removeAttribute("class");
                        }

                        this.className = "same-as-selected";
                        break;
                    }
                }
                selectedDiv.click();
                nativeSelect.dispatchEvent(new Event('change'));
            });

            optionsDiv.appendChild(optionItemDiv);
        }

        wrapper.appendChild(optionsDiv);

        selectedDiv.addEventListener("click", function (e) {
            e.stopPropagation();
            closeAllSelect(this);
            this.nextSibling.classList.toggle("select-hide");
            this.classList.toggle("select-arrow-active");
        });
    }

    function closeAllSelect(elmnt) {
        const items = document.getElementsByClassName("select-items");
        const selected = document.getElementsByClassName("select-selected");

        for (let i = 0; i < selected.length; i++) {
            if (elmnt !== selected[i]) {
                selected[i].classList.remove("select-arrow-active");
            }
        }

        for (let i = 0; i < items.length; i++) {
            if (elmnt.nextSibling !== items[i]) {
                items[i].classList.add("select-hide");
            }
        }
    }

    document.addEventListener("click", closeAllSelect);
    initializeCustomSelect(document.querySelector(".custom-select-wrapper"));
});
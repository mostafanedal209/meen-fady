(function(){

  // =====================================================================
  // FIREBASE CONFIG — استبدل القيم دي بالقيم اللي هتاخدها من مشروعك على
  // Firebase Console (Project Settings → General → Your apps → SDK setup).
  // بعد ما تحط القيم الصح، الموقع هيشتغل فعليًا بتخزين مشترك حقيقي.
  // =====================================================================
  const firebaseConfig = {
    apiKey: "AIzaSyCpN9Ce1i7WAeh6ulTG-YKODGJGP3_TV08",
    authDomain: "meen-fady.firebaseapp.com",
    databaseURL: "https://meen-fady-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "meen-fady",
    storageBucket: "meen-fady.firebasestorage.app",
    messagingSenderId: "966832665048",
    appId: "1:966832665048:web:947bde2bc36557e22702ad"
  };

  let db = null;
  let firebaseReady = false;
  try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    firebaseReady = true;
  }catch(e){
    console.error('Firebase init failed — did you paste your config values?', e);
  }

  // ---------- DOM refs ----------
  const homeView = document.getElementById('homeView');
  const nameView = document.getElementById('nameView');
  const roomView = document.getElementById('roomView');

  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinCodeInput = document.getElementById('joinCodeInput');
  const joinRoomBtn = document.getElementById('joinRoomBtn');

  const nameInput = document.getElementById('nameInput');
  const saveNameBtn = document.getElementById('saveNameBtn');

  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const copyFeedback = document.getElementById('copyFeedback');
  const notifBtn = document.getElementById('notifBtn');

  const myNameDisplay = document.getElementById('myNameDisplay');
  const imFreeState = document.getElementById('imFreeState');
  const myActivityDisplay = document.getElementById('myActivityDisplay');
  const myTimerDisplay = document.getElementById('myTimerDisplay');
  const endFreeBtn = document.getElementById('endFreeBtn');
  const openFreeFormBtn = document.getElementById('openFreeFormBtn');

  const freeForm = document.getElementById('freeForm');
  const customDurationInput = document.getElementById('customDurationInput');
  const activityInput = document.getElementById('activityInput');
  const confirmFreeBtn = document.getElementById('confirmFreeBtn');
  const cancelFreeBtn = document.getElementById('cancelFreeBtn');

  const freeCountEl = document.getElementById('freeCount');
  const freeList = document.getElementById('freeList');
  const freeEmptyNote = document.getElementById('freeEmptyNote');
  const othersSection = document.getElementById('othersSection');
  const othersList = document.getElementById('othersList');
  const leaderboardCard = document.getElementById('leaderboardCard');
  const leaderboardList = document.getElementById('leaderboardList');

  // ---------- state ----------
  let roomCode = '';
  let myName = '';
  let membersData = {};
  let selectedDuration = 30;
  let roomRef = null;
  let prevFreeNames = new Set();

  // ---------- helpers ----------
  function generateRoomCode(){
    return Math.random().toString(36).slice(2, 8);
  }
  function getSavedName(code){
    try{ return localStorage.getItem('meenFady_name_' + code) || ''; }catch(e){ return ''; }
  }
  function saveNameLocally(code, name){
    try{ localStorage.setItem('meenFady_name_' + code, name); }catch(e){ /* ignore */ }
  }
  function updateUrl(code){
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    window.history.replaceState({}, '', url);
  }
  function minutesLeft(expiresAt){
    return Math.max(1, Math.round((expiresAt - Date.now()) / 60000));
  }

  // ---------- view switching ----------
  function showView(view){
    homeView.classList.add('hidden');
    nameView.classList.add('hidden');
    roomView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  // ---------- room entry flow ----------
  function enterRoom(code){
    if(!firebaseReady){
      alert('لسه محتاجين نظبط بيانات Firebase في script.js قبل ما تشتغل الأوضة فعليًا.');
      return;
    }
    roomCode = code;
    updateUrl(code);
    roomCodeDisplay.textContent = code;

    const saved = getSavedName(code);
    if(saved){
      myName = saved;
      startRoom();
    } else {
      showView(nameView);
    }
  }

  createRoomBtn.addEventListener('click', () => enterRoom(generateRoomCode()));
  joinRoomBtn.addEventListener('click', () => {
    const code = joinCodeInput.value.trim().toLowerCase();
    if(code) enterRoom(code);
  });
  joinCodeInput.addEventListener('keydown', e => { if(e.key === 'Enter') joinRoomBtn.click(); });

  saveNameBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if(!name) return;
    myName = name;
    saveNameLocally(roomCode, name);
    startRoom();
  });
  nameInput.addEventListener('keydown', e => { if(e.key === 'Enter') saveNameBtn.click(); });

  // ---------- start listening to a room ----------
  function startRoom(){
    myNameDisplay.textContent = myName;
    showView(roomView);

    if(roomRef) roomRef.off();
    roomRef = db.ref('rooms/' + roomCode + '/members');

    // make sure I exist as a known member even before I ever mark myself free
    roomRef.child(myName).transaction(current => {
      if(current === null){
        return { activity: '', expiresAt: 0, freeCount: 0 };
      }
      return current;
    });

    roomRef.on('value', snapshot => {
      membersData = snapshot.val() || {};
      render();
      checkForNewlyFree();
    });

    if(typeof Notification !== 'undefined' && Notification.permission === 'default'){
      notifBtn.classList.remove('hidden');
    }
  }

  function checkForNewlyFree(){
    const nowTs = Date.now();
    const currentFree = new Set(
      Object.entries(membersData)
        .filter(([, d]) => d.expiresAt > nowTs)
        .map(([n]) => n)
    );
    if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
      currentFree.forEach(name => {
        if(!prevFreeNames.has(name) && name !== myName){
          const info = membersData[name];
          try{
            new Notification(name + ' بقى فاضي دلوقتي 🙋', {
              body: info.activity ? ('عايز/ة: ' + info.activity) : 'افتح الأوضة وشوف'
            });
          }catch(e){ /* notifications blocked, ignore */ }
        }
      });
    }
    prevFreeNames = currentFree;
  }

  // ---------- rendering ----------
  function render(){
    const nowTs = Date.now();
    const entries = Object.entries(membersData);

    // my status
    const mine = membersData[myName];
    if(mine && mine.expiresAt > nowTs){
      imFreeState.classList.remove('hidden');
      openFreeFormBtn.classList.add('hidden');
      freeForm.classList.add('hidden');
      myActivityDisplay.textContent = mine.activity || '';
      myActivityDisplay.style.display = mine.activity ? 'block' : 'none';
      myTimerDisplay.textContent = 'فاضل ' + minutesLeft(mine.expiresAt) + ' دقيقة';
    } else {
      imFreeState.classList.add('hidden');
      if(freeForm.classList.contains('hidden')){
        openFreeFormBtn.classList.remove('hidden');
      }
    }

    // free members list
    const freeMembers = entries
      .filter(([, d]) => d.expiresAt > nowTs)
      .sort((a, b) => b[1].expiresAt - a[1].expiresAt);

    freeCountEl.textContent = freeMembers.length;
    freeList.innerHTML = '';
    freeEmptyNote.classList.toggle('hidden', freeMembers.length > 0);

    freeMembers.forEach(([name, d]) => {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `
        <div>
          <div class="member-name">${name}</div>
          ${d.activity ? `<div class="member-activity">${d.activity}</div>` : ''}
        </div>
        <div class="member-timer">⏱ ${minutesLeft(d.expiresAt)} د</div>
      `;
      freeList.appendChild(row);
    });

    // other known members
    const otherMembers = entries
      .filter(([, d]) => d.expiresAt <= nowTs)
      .sort((a, b) => a[0].localeCompare(b[0]));

    othersSection.classList.toggle('hidden', otherMembers.length === 0);
    othersList.innerHTML = otherMembers.map(([name]) =>
      `<span class="other-chip">${name}</span>`
    ).join('');

    // leaderboard
    const leaderboard = entries
      .filter(([, d]) => (d.freeCount || 0) > 0)
      .sort((a, b) => (b[1].freeCount || 0) - (a[1].freeCount || 0))
      .slice(0, 3);

    leaderboardCard.classList.toggle('hidden', leaderboard.length === 0);
    const medals = ['🥇', '🥈', '🥉'];
    leaderboardList.innerHTML = leaderboard.map(([name, d], i) => `
      <div class="leader-row">
        <span class="leader-name">${medals[i]} ${name}</span>
        <span class="leader-count">${d.freeCount} مرة</span>
      </div>
    `).join('');
  }

  // re-render every second for live countdowns
  setInterval(() => { if(roomCode) render(); }, 1000);

  // ---------- free form ----------
  openFreeFormBtn.addEventListener('click', () => {
    openFreeFormBtn.classList.add('hidden');
    freeForm.classList.remove('hidden');
  });
  cancelFreeBtn.addEventListener('click', () => {
    freeForm.classList.add('hidden');
    openFreeFormBtn.classList.remove('hidden');
  });

  document.querySelectorAll('.duration-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.duration-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDuration = parseInt(btn.getAttribute('data-mins'), 10);
      customDurationInput.value = '';
    });
  });
  document.querySelector('.duration-chip[data-mins="30"]').classList.add('active');

  document.querySelectorAll('.example-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activityInput.value = btn.getAttribute('data-text');
    });
  });

  confirmFreeBtn.addEventListener('click', () => {
    const duration = customDurationInput.value ? parseInt(customDurationInput.value, 10) : selectedDuration;
    if(!duration || duration <= 0) return;

    const prevCount = (membersData[myName] && membersData[myName].freeCount) || 0;
    roomRef.child(myName).set({
      activity: activityInput.value.trim(),
      expiresAt: Date.now() + duration * 60000,
      freeCount: prevCount + 1
    });

    freeForm.classList.add('hidden');
    activityInput.value = '';
    customDurationInput.value = '';
  });

  endFreeBtn.addEventListener('click', () => {
    const mine = membersData[myName] || {};
    roomRef.child(myName).set({
      activity: mine.activity || '',
      expiresAt: 0,
      freeCount: mine.freeCount || 0
    });
  });

  // ---------- notifications ----------
  notifBtn.addEventListener('click', () => {
    if(typeof Notification === 'undefined') return;
    Notification.requestPermission().then(perm => {
      if(perm !== 'default') notifBtn.classList.add('hidden');
    });
  });

  // ---------- copy link ----------
  copyLinkBtn.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    navigator.clipboard?.writeText(url.toString()).then(() => {
      copyFeedback.classList.remove('hidden');
      setTimeout(() => copyFeedback.classList.add('hidden'), 2200);
    });
  });

  // ---------- boot: check for ?room= in URL ----------
  (function init(){
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if(roomFromUrl){
      enterRoom(roomFromUrl.toLowerCase());
    }
  })();

})();
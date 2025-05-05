const API_BASE_URL = 'http://localhost:3000/api';
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
const socket = io('http://localhost:3000');

// Initialize UI based on auth status
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const profileBtn = document.getElementById('profile-btn');
    const logoutBtn = document.getElementById('logout-btn');
    if (token && username) {
        loginBtn.classList.add('hidden');
        profileBtn.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        loginBtn.classList.remove('hidden');
        profileBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
}
updateAuthUI();

// Notification
function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

// Modal Handling
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}
function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('show');
    });
});
document.getElementById('login-btn').addEventListener('click', () => showModal('login-modal'));
document.getElementById('profile-btn').addEventListener('click', () => {
    showModal('profile-modal');
    fetchProfile();
});
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    token = null;
    username = null;
    updateAuthUI();
    showNotification('ออกจากระบบสำเร็จ');
});

function showLoginModal() {
    hideModal('register-modal');
    showModal('login-modal');
}
function showRegisterModal() {
    hideModal('login-modal');
    showModal('register-modal');
}

// Authentication
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const error = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            token = data.token;
            username = data.username;
            updateAuthUI();
            hideModal('login-modal');
            showNotification('เข้าสู่ระบบสำเร็จ');
        } else {
            error.textContent = data.error || 'เกิดข้อผิดพลาด';
            error.style.display = 'block';
        }
    } catch (err) {
        error.textContent = 'เกิดข้อผิดพลาด';
        error.style.display = 'block';
    }
}

async function register() {
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const error = document.getElementById('register-error');

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            token = data.token;
            username = data.username;
            updateAuthUI();
            hideModal('register-modal');
            showNotification('สมัครสมาชิกสำเร็จ');
        } else {
            error.textContent = data.error || 'เกิดข้อผิดพลาด';
            error.style.display = 'block';
        }
    } catch (err) {
        error.textContent = 'เกิดข้อผิดพลาด';
        error.style.display = 'block';
    }
}

async function fetchProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('profile-username').textContent = data.username;
            document.getElementById('profile-email').textContent = data.email;
            const usageList = document.getElementById('water-usage-list');
            usageList.innerHTML = data.waterUsage.map(usage => 
                `<li>${new Date(usage.date).toLocaleDateString('th-TH')}: ${usage.liters} ลิตร</li>`
            ).join('');
        } else {
            showNotification('ไม่สามารถโหลดโปรไฟล์');
        }
    } catch (err) {
        showNotification('เกิดข้อผิดพลาด');
    }
}

// Game Logic
let score = 0;
function initGame() {
    const dropZone = document.getElementById('drop-zone');
    const draggableItems = document.getElementById('draggable-items');
    const items = ['💧', '🚿', '🧼'];
    items.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item;
        div.className = 'draggable p-4 bg-blue-500 rounded cursor-move';
        div.draggable = true;
        div.addEventListener('dragstart', e => e.dataTransfer.setData('text', item));
        draggableItems.appendChild(div);
    });

    dropZone.addEventListener('dragover', e => e.preventDefault());
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        score += 10;
        document.getElementById('game-score').textContent = `คะแนน: ${score}`;
    });
}
initGame();

async function submitScore() {
    if (!token) {
        showModal('login-modal');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/high-scores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ score })
        });
        const data = await response.json();
        if (response.ok) {
            showNotification('บันทึกคะแนนสำเร็จ');
            score = 0;
            document.getElementById('game-score').textContent = `คะแนน: ${score}`;
        } else {
            showNotification(data.error || 'ไม่สามารถบันทึกคะแนน');
        }
    } catch (err) {
        showNotification('เกิดข้อผิดพลาด');
    }
}

// Calculator
async function calculateWaterCost() {
    if (!token) {
        showModal('login-modal');
        return;
    }
    const people = parseInt(document.getElementById('people').value) || 1;
    const shower = parseInt(document.getElementById('shower').value) || 0;
    const dishes = parseInt(document.getElementById('dishes').value) || 0;

    try {
        const response = await fetch(`${API_BASE_URL}/calculate-water-cost`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ people, shower, dishes })
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('cost-result').textContent = data.message;
        } else {
            document.getElementById('cost-result').textContent = data.error || 'ไม่สามารถคำนวณ';
        }
    } catch (err) {
        document.getElementById('cost-result').textContent = 'เกิดข้อผิดพลาด';
    }
}

// Newsletter
async function subscribeNewsletter() {
    const email = document.getElementById('newsletter-email').value;
    try {
        const response = await fetch(`${API_BASE_URL}/newsletter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        showNotification(data.message || data.error);
    } catch (err) {
        showNotification('เกิดข้อผิดพลาด');
    }
}

// Community Posts
async function fetchPosts() {
    try {
        const response = await fetch(`${API_BASE_URL}/community-posts`);
        const posts = await response.json();
        const container = document.getElementById('posts-container');
        container.innerHTML = posts.map(post => `
            <div class="community-post">
                <p><strong>${post.username}</strong>: ${post.content}</p>
                <p>${new Date(post.createdAt).toLocaleDateString('th-TH')}</p>
                <button class="like-btn" onclick="likePost('${post.id}')">${post.likes} ไลค์</button>
            </div>
        `).join('');
    } catch (err) {
        showNotification('ไม่สามารถโหลดโพสต์');
    }
}
fetchPosts();

async function createPost() {
    if (!token) {
        showModal('login-modal');
        return;
    }
    const content = document.getElementById('post-content').value;
    if (!content) return;

    try {
        const response = await fetch(`${API_BASE_URL}/community-posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content })
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('post-content').value = '';
            fetchPosts();
            showNotification('โพสต์สำเร็จ');
        } else {
            showNotification(data.error || 'ไม่สามารถโพสต์');
        }
    } catch (err) {
        showNotification('เกิดข้อผิดพลาด');
    }
}

async function likePost(postId) {
    if (!token) {
        showModal('login-modal');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/community-posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            fetchPosts();
        } else {
            showNotification(data.error || 'ไม่สามารถกดไลค์');
        }
    } catch (err) {
        showNotification('เกิดข้อผิดพลาด');
    }
}

// WebSocket Events
socket.on('newHighScore', data => {
    showNotification(`คะแนนใหม่จาก ${data.username}: ${data.score}`);
});
socket.on('newCommunityPost', post => {
    fetchPosts();
});
socket.on('postLiked', data => {
    fetchPosts();
});

// Chart.js
const ctx = document.getElementById('waterChart').getContext('2d');
new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['อาบน้ำ', 'ล้างจาน', 'ซักผ้า', 'รดน้ำต้นไม้', 'อื่นๆ'],
        datasets: [{
            label: 'การใช้น้ำ (ลิตร)',
            data: [150, 40, 80, 60, 30],
            backgroundColor: 'rgba(163, 223, 250, 0.5)'
        }]
    },
    options: {
        scales: { y: { beginAtZero: true } }
    }
});

// Preloader
window.addEventListener('load', () => {
    document.querySelector('.preloader').classList.add('hidden');
});

// Scroll Effects
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    navbar.classList.toggle('scrolled', window.scrollY > 50);
    document.getElementById('scroll-top').classList.toggle('visible', window.scrollY > 300);

    const scrollDepth = document.querySelector('.scroll-depth-bar');
    const scrollText = document.querySelector('.scroll-depth-text');
    const scrollPercent = Math.min((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100, 100);
    scrollDepth.style.width = scrollPercent + '%';
    scrollText.textContent = Math.round(scrollPercent) + '%';
});
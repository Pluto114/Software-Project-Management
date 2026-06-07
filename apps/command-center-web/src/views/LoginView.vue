<template>
  <div class="login-page">
    <section class="login-brand">
      <div class="brand-mark">海湾养殖管理平台</div>
      <h1>企业生产与资产管理系统</h1>
      <p>按岗位进入系统，只展示当前职责需要的数据、页面和操作。</p>

      <div class="role-preview">
        <div class="role-preview-item" v-for="user in accountOptions" :key="user.username">
          <span>{{ user.roleLabel }}</span>
          <strong>{{ user.scopeLabel }}</strong>
        </div>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-header">
        <span class="panel-title">登录</span>
        <span class="login-sub">公司内部账号</span>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <label>
          账号
          <input v-model.trim="username" autocomplete="username" placeholder="请输入账号" />
        </label>
        <label>
          密码
          <input v-model="password" autocomplete="current-password" placeholder="请输入密码" type="password" />
        </label>

        <div v-if="auth.loginError" class="login-error">{{ auth.loginError }}</div>

        <button class="login-button" type="submit" :disabled="submitting">
          {{ submitting ? '登录中...' : '进入系统' }}
        </button>
      </form>

      <div class="account-list">
        <div class="account-list-title">岗位账号</div>
        <button
          v-for="account in accountOptions"
          :key="account.username"
          class="account-card"
          :class="{ active: username === account.username }"
          type="button"
          @click="fillAccount(account.username)"
        >
          <span>
            <strong>{{ account.roleLabel }}</strong>
            <small>{{ account.name }} · {{ account.department }}</small>
          </span>
          <em>{{ account.username }}</em>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { accountOptions, useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref(accountOptions[0]?.username || '')
const password = ref('')
const submitting = ref(false)

const selectedAccount = computed(() => accountOptions.find(account => account.username === username.value))

function fillAccount(nextUsername: string) {
  username.value = nextUsername
  password.value = `${nextUsername}123`
}

async function submitLogin() {
  submitting.value = true
  const passed = await auth.login(username.value, password.value)
  submitting.value = false
  if (!passed) return

  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  const redirectPath = redirect.split('?')[0]
  const target = redirect && auth.canAccess(redirectPath) ? redirect : auth.homePath
  router.replace(target)
}

if (selectedAccount.value) {
  fillAccount(selectedAccount.value.username)
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  background: var(--bg-primary);
}

.login-brand {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 64px 9vw;
}

.brand-mark {
  width: fit-content;
  margin-bottom: 22px;
  padding: 7px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
  color: var(--accent-blue);
  font-weight: 700;
}

.login-brand h1 {
  max-width: 620px;
  margin-bottom: 14px;
  color: var(--text-primary);
  font-size: 34px;
  line-height: 1.2;
  font-weight: 750;
}

.login-brand p {
  max-width: 560px;
  color: var(--text-secondary);
  font-size: 15px;
}

.role-preview {
  width: min(680px, 100%);
  margin-top: 34px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.role-preview-item {
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
}

.role-preview-item span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-primary);
  font-weight: 650;
}

.role-preview-item strong {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.login-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
  background: #ffffff;
  border-left: 1px solid var(--border-color);
}

.login-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20px;
}

.login-sub {
  color: var(--text-dim);
  font-size: 12px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.login-form input {
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  outline: none;
}

.login-form input:focus {
  border-color: var(--accent-blue);
}

.login-error {
  padding: 9px 10px;
  border: 1px solid #e3b7b4;
  border-radius: 6px;
  background: var(--accent-red-dim);
  color: var(--accent-red);
  font-size: 12px;
}

.login-button {
  height: 40px;
  border: 1px solid var(--accent-blue);
  border-radius: 6px;
  background: var(--accent-blue);
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.login-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.account-list {
  margin-top: 28px;
}

.account-list-title {
  margin-bottom: 8px;
  color: var(--text-dim);
  font-size: 12px;
}

.account-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.account-card.active,
.account-card:hover {
  border-color: var(--accent-blue);
  background: var(--accent-blue-dim);
}

.account-card strong,
.account-card small {
  display: block;
}

.account-card small {
  margin-top: 3px;
  color: var(--text-secondary);
}

.account-card em {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 12px;
  font-style: normal;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-brand {
    padding: 34px 22px 18px;
  }

  .role-preview {
    grid-template-columns: 1fr;
  }

  .login-panel {
    padding: 24px 22px;
    border-left: none;
    border-top: 1px solid var(--border-color);
  }
}
</style>

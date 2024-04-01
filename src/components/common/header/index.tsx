import { Child, FC } from "hono/jsx";

export const Header: FC<{ children?: Child }> = ({ children }) => {
  return (
    <div class="navbar bg-base-100">
      <div class="navbar-start">
        <div class="dropdown">
          <div tabindex={0} role="button" class="btn btn-ghost btn-circle">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h7"
              />
            </svg>
          </div>
          <ul
            tabindex={0}
            class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52"
          >
            <li>
              <a href="/articles">記事一覧</a>
            </li>
            <li>
              <a href="/ranking">いいね・投稿数ランキング</a>
            </li>
          </ul>
        </div>
      </div>
      <div class="navbar-center">
        <a
          class="btn btn-ghost text-xl"
          href="https://qiita.com/organizations/primebrains"
          target="_blank"
          rel="noopener noreferrer"
        >
          PB Qiita
        </a>
      </div>
      <div class="navbar-end">
        <ul class="menu menu-horizontal px-1">{children}</ul>
      </div>
    </div>
  );
};

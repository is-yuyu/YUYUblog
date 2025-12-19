# YUYU微博 项目骨架

此仓库为 YUYU微博 的项目骨架，包含数据库模式、后端 C++ 骨架（REST API stub）和前端静态页面示例。

快速指南

- 数据库：openGauss（运行 db/schema.sql 来创建表）
- 后端：C++17（使用 CMake 构建，示例使用外部单文件 HTTP 库，如 `cpp-httplib`）
- 前端：静态 HTML/CSS/JS（位于 `frontend/`）

依赖（最小）

- Git
- CMake >= 3.10
- Visual Studio (Windows) 或 等效的 C++ 编译器（GCC/Clang）
- openGauss / PostgreSQL 服务（用于运行 `db/schema.sql`）
- PostgreSQL 客户端 开发库（libpq）
- OpenSSL 开发库（用于 SHA256）

Windows 下构建与运行示例

1. 确保已安装 Git、CMake、Visual Studio（含 C++ 工具）以及 libpq 和 OpenSSL 开发包（可通过 vcpkg 或手动安装）。

2. 在项目根目录创建构建目录并配置：

```powershell
Push-Location 'd:\cloneC\Desktop\yuyu\数据库系统\YUYUblog'
if (!(Test-Path build)) { New-Item -ItemType Directory build }
Push-Location build
cmake ..
cmake --build .
Pop-Location
Pop-Location
```

3. 运行后端（示例：可执行文件位于 `backend` 的构建输出目录，名称 `yuyu_backend`）：

```powershell
# 若使用 Visual Studio 生成，二进制可能在 build\Debug 或 build\Release
.
\path\to\build\Debug\yuyu_backend.exe
```

4. 启动前请先在 openGauss/PostgreSQL 中执行：

```sql
\i db/schema.sql
```

说明

- CMakeLists 已配置 FetchContent 拉取 `cpp-httplib` 与 `nlohmann/json`，并查找系统的 PostgreSQL (libpq) 与 OpenSSL。
- 示例后端实现位于 `backend/src`：包含 `db.cpp`（使用 libpq）、`server.cpp`（使用 cpp-httplib 提供 `/api/register` `/api/login` `/api/weibo`）以及 `main.cpp`。
- `frontend/` 提供一个简单示例页面用于快速交互测试。

常见问题

- 如果 CMake 找不到 `PostgreSQL` 或 `OpenSSL`，可通过 vcpkg 安装并在 CMake 调用时传入 `-DCMAKE_TOOLCHAIN_FILE` 指向 vcpkg 工具链文件，或将库安装到系统可发现路径。


构建后端（示例，需安装 CMake + 编译器）

```bash
mkdir build
cd build
cmake ..
cmake --build .
```

使用说明

- 先在 openGauss 中执行 `db/schema.sql` 创建表
- 启动后端服务（待实现具体 HTTP 库）
- 打开 `frontend/index.html` 在浏览器中进行交互

下一步

- 填充后端 HTTP 实现（建议使用 `cpp-httplib` 或 `Crow`）
- 实现数据库访问层（C++ 的 libpq 或其他 openGauss 客户端）


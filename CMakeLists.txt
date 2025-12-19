# 最低CMake版本要求
cmake_minimum_required(VERSION 3.10)
# 项目名称和语言
project(YUYUBackend LANGUAGES CXX)
add_definitions(-D_WIN32_WINNT=0x0A00)
# ========== 核心编译配置 ==========
# C++17标准（强制）
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# 强制禁用vcpkg工具链（彻底隔离）
set(CMAKE_TOOLCHAIN_FILE "" CACHE PATH "" FORCE)
# 关闭不必要的警告
cmake_policy(SET CMP0074 OLD)

# ========== 本地依赖头文件（无需在线下载） ==========
# 请确保以下路径下有对应的文件：
# 3rdparty/httplib/httplib.h
# 3rdparty/json/include/nlohmann/json.hpp
include_directories(
    ${CMAKE_SOURCE_DIR}/3rdparty/httplib          # httplib.h 所在目录
    ${CMAKE_SOURCE_DIR}/3rdparty/json/include  # json.hpp 所在目录
    ${CMAKE_SOURCE_DIR}/include                   # 项目自身头文件目录（可选）
    ${CMAKE_SOURCE_DIR}/backend/include
)

# ========== 手动指定所有库的路径（彻底避开find_package） ==========
# ---------------- PostgreSQL 配置 ----------------
# 替换为你的PostgreSQL实际路径（免安装版/D:\pgsql 或安装版/C:\Program Files\PostgreSQL\16）
set(PG_DIR "D:/pgsql")
include_directories(${PG_DIR}/include)            # PostgreSQL头文件
link_directories(${PG_DIR}/lib)                   # PostgreSQL库文件

# ---------------- OpenSSL 配置 ----------------
# 替换为你的OpenSSL实际路径
set(OPENSSL_DIR "C:/OpenSSL-Win64")
include_directories(${OPENSSL_DIR}/include)       # OpenSSL头文件
link_directories(${OPENSSL_DIR}/lib)              # OpenSSL库文件

# ========== 编译可执行文件 ==========
# 注意：目标名必须是`yuyu_backend`（与链接目标一致）
add_executable(yuyu_backend 
    backend/src/main.cpp 
    backend/src/server.cpp 
    backend/src/db.cpp
)

# ========== 链接所有依赖库 ==========
# 语法要求：库名单独一行，无中文注释混写
target_link_libraries(yuyu_backend PRIVATE
    # PostgreSQL核心库
    libpq.lib
    # OpenSSL核心库
    libssl.lib
    libcrypto.lib
    # Windows系统库
    ws2_32
    crypt32
)

# ========== MSVC编译器专属配置（消除安全警告） ==========
if(MSVC)
    # 禁用VS的安全函数警告（如sprintf、fopen等）
    target_compile_definitions(yuyu_backend PRIVATE 
        _CRT_SECURE_NO_WARNINGS
        _WIN32_WINNT=0x0601  # 兼容Windows 7+
    )
    # 启用多线程编译（加速编译）
    target_compile_options(yuyu_backend PRIVATE /MP)
endif()

# ========== 输出路径配置（可选，方便找到可执行文件） ==========
set_target_properties(yuyu_backend PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin  # 可执行文件输出到bin目录
    RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin/Debug
    RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin/Release
)
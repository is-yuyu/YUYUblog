cmake_minimum_required(VERSION 3.10)
project(YUYUBackend LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(FetchContent)

FetchContent_Declare(
	httplib
	GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
	GIT_TAG master
)
FetchContent_MakeAvailable(httplib)

FetchContent_Declare(
	nlohmann_json
	GIT_REPOSITORY https://github.com/nlohmann/json.git
	GIT_TAG v3.11.2
)
FetchContent_MakeAvailable(nlohmann_json)

# 设置PostgreSQL路径
set(PostgreSQL_ROOT "C:/Program Files/psqlODBC")
find_package(PostgreSQL REQUIRED)

# 指定OpenSSL路径
set(OPENSSL_ROOT_DIR "C:/OpenSSL-win64")
find_package(OpenSSL REQUIRED)

add_executable(yuyu_backend src/main.cpp src/server.cpp src/db.cpp)

target_include_directories(yuyu_backend PRIVATE ${httplib_SOURCE_DIR} ${CMAKE_SOURCE_DIR}/include ${PostgreSQL_INCLUDE_DIRS})
target_link_libraries(yuyu_backend PRIVATE 
    nlohmann_json::nlohmann_json 
    PostgreSQL::PostgreSQL 
    OpenSSL::SSL
    OpenSSL::Crypto
)

if(MSVC)
	target_compile_definitions(yuyu_backend PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()
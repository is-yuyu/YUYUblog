#include "db.h"
#include <libpq-fe.h>
#include <cstring>
#include <memory>
#include <nlohmann/json.hpp>
using json = nlohmann::json;
#include <fstream>
#include <sstream>
#include <vector>

struct Database::Impl {
    PGconn *conn = nullptr;
};

Database::Database() : pimpl(new Impl()) {}

Database::~Database() {
    if (pimpl) {
        if (pimpl->conn) PQfinish(pimpl->conn);
        delete pimpl;
        pimpl = nullptr;
    }
}

bool Database::init(const std::string &conninfo, std::string &err) {
    pimpl->conn = PQconnectdb(conninfo.c_str());
    if (PQstatus(pimpl->conn) != CONNECTION_OK) {
        err = PQerrorMessage(pimpl->conn);
        PQfinish(pimpl->conn);
        pimpl->conn = nullptr;
        return false;
    }

    // Try to apply schema SQL if available in repository (support several relative paths)
    const char *candidates[] = {"db/schema.sql", "./db/schema.sql", "../db/schema.sql", "../../db/schema.sql"};
    for (auto &p : candidates) {
        std::ifstream ifs(p);
        if (!ifs) continue;
        std::stringstream ss; ss << ifs.rdbuf();
        std::string sql = ss.str();
        if (sql.empty()) continue;
        PGresult *r = PQexec(pimpl->conn, sql.c_str());
        if (!r) {
            err = PQerrorMessage(pimpl->conn);
            // don't treat missing/empty schema as fatal if DB already initialized
            break;
        }
        ExecStatusType st = PQresultStatus(r);
        if (st != PGRES_COMMAND_OK && st != PGRES_TUPLES_OK) {
            err = PQresultErrorMessage(r);
            PQclear(r);
            break;
        }
        PQclear(r);
        // applied (or no-op because of IF NOT EXISTS)
        break;
    }
    return true;
}

bool Database::create_user(const std::string &username, const std::string &email, const std::string &password_hash, long &out_user_id, std::string &err) {
    const char *paramValues[3] = {username.c_str(), email.c_str(), password_hash.c_str()};
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING user_id;",
        3, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        err = PQresultErrorMessage(res);
        PQclear(res);
        return false;
    }
    char *val = PQgetvalue(res, 0, 0);
    out_user_id = atol(val);
    PQclear(res);
    return true;
}

bool Database::check_user(const std::string &email, const std::string &password_hash, long &out_user_id) {
    const char *paramValues[2] = {email.c_str(), password_hash.c_str()};
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT user_id FROM users WHERE email=$1 AND password_hash=$2;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) return false;
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { PQclear(res); return false; }
    if (PQntuples(res) == 0) { PQclear(res); return false; }
    char *val = PQgetvalue(res, 0, 0);
    out_user_id = atol(val);
    PQclear(res);
    return true;
}

bool Database::create_weibo(long user_id, const std::string &content, const std::string &media, long &out_weibo_id, std::string &err) {
    const char *paramValues[3];
    std::string s_user = std::to_string(user_id);
    paramValues[0] = s_user.c_str();
    paramValues[1] = content.c_str();
    paramValues[2] = media.c_str();
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO weibos(user_id,content,media) VALUES($1::bigint,$2,$3) RETURNING weibo_id;",
        3, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        err = PQresultErrorMessage(res);
        PQclear(res);
        return false;
    }
    char *val = PQgetvalue(res, 0, 0);
    out_weibo_id = atol(val);
    PQclear(res);
    return true;
}

bool Database::get_weibos(int limit, std::string &json_out, std::string &err) {
    if (!pimpl->conn) { err = "no connection"; return false; }
    std::string s_limit = std::to_string(limit);
    const char *paramValues[1] = { s_limit.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT w.weibo_id, w.user_id, u.username, w.content, COALESCE(w.media,'') AS media, EXTRACT(EPOCH FROM w.created_at)*1000::bigint AS created_ms "
        "FROM weibos w JOIN users u ON w.user_id = u.user_id "
        "ORDER BY w.created_at DESC LIMIT $1;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        err = PQresultErrorMessage(res);
        PQclear(res);
        return false;
    }
    nlohmann::json arr = nlohmann::json::array();
    int rows = PQntuples(res);
    for (int i = 0; i < rows; ++i) {
        nlohmann::json item;
        item["weibo_id"] = std::stol(PQgetvalue(res, i, 0));
        item["user_id"] = std::stol(PQgetvalue(res, i, 1));
        item["username"] = std::string(PQgetvalue(res, i, 2));
        item["content"] = std::string(PQgetvalue(res, i, 3));
        item["media"] = std::string(PQgetvalue(res, i, 4));
        // created_ms is numeric string
        try { item["created_at"] = std::stoll(PQgetvalue(res, i, 5)); } catch(...) { item["created_at"] = 0; }
        arr.push_back(item);
    }
    PQclear(res);
    nlohmann::json out;
    out["weibos"] = arr;
    json_out = out.dump();
    return true;
}

bool Database::create_comment(long user_id, long weibo_id, const std::string &content, long &out_comment_id, std::string &err) {
    const char *paramValues[3] = { std::to_string(weibo_id).c_str(), std::to_string(user_id).c_str(), content.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO comments(weibo_id,user_id,content) VALUES($1::bigint,$2::bigint,$3) RETURNING comment_id;",
        3, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    out_comment_id = std::stol(PQgetvalue(res,0,0)); PQclear(res); return true;
}

bool Database::add_like(long user_id, long weibo_id, long &out_like_id, std::string &err) {
    const char *paramValues[2] = { std::to_string(weibo_id).c_str(), std::to_string(user_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO likes(weibo_id,user_id) VALUES($1::bigint,$2::bigint) RETURNING like_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    out_like_id = std::stol(PQgetvalue(res,0,0)); PQclear(res); return true;
}

bool Database::remove_like(long user_id, long weibo_id, std::string &err) {
    const char *paramValues[2] = { std::to_string(weibo_id).c_str(), std::to_string(user_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM likes WHERE weibo_id=$1::bigint AND user_id=$2::bigint RETURNING like_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::create_follow(long follower_id, long followee_id, long &out_follow_id, std::string &err) {
    const char *paramValues[2] = { std::to_string(follower_id).c_str(), std::to_string(followee_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO follows(follower_id,followee_id) VALUES($1::bigint,$2::bigint) RETURNING follow_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    out_follow_id = std::stol(PQgetvalue(res,0,0)); PQclear(res); return true;
}

bool Database::remove_follow(long follower_id, long followee_id, std::string &err) {
    const char *paramValues[2] = { std::to_string(follower_id).c_str(), std::to_string(followee_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM follows WHERE follower_id=$1::bigint AND followee_id=$2::bigint RETURNING follow_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::delete_weibo(long user_id, long weibo_id, std::string &err) {
    const char *paramValues[2] = { std::to_string(weibo_id).c_str(), std::to_string(user_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM weibos WHERE weibo_id=$1::bigint AND user_id=$2::bigint RETURNING weibo_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::get_followers(long user_id, std::string &json_out, std::string &err) {
    const char *paramValues[1] = { std::to_string(user_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT u.user_id,u.username FROM follows f JOIN users u ON f.follower_id = u.user_id WHERE f.followee_id = $1::bigint;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    json arr = json::array();
    for (int i=0;i<PQntuples(res);++i){ json it; it["user_id"] = std::stol(PQgetvalue(res,i,0)); it["username"] = std::string(PQgetvalue(res,i,1)); arr.push_back(it);} PQclear(res);
    json out; out["users"] = arr; json_out = out.dump(); return true;
}

bool Database::get_following(long user_id, std::string &json_out, std::string &err) {
    const char *paramValues[1] = { std::to_string(user_id).c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT u.user_id,u.username FROM follows f JOIN users u ON f.followee_id = u.user_id WHERE f.follower_id = $1::bigint;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    json arr = json::array();
    for (int i=0;i<PQntuples(res);++i){ json it; it["user_id"] = std::stol(PQgetvalue(res,i,0)); it["username"] = std::string(PQgetvalue(res,i,1)); arr.push_back(it);} PQclear(res);
    json out; out["users"] = arr; json_out = out.dump(); return true;
}

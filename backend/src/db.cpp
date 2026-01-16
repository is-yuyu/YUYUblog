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
        "SELECT w.weibo_id, w.user_id, u.username, COALESCE(u.avatar,'') AS avatar, w.content, COALESCE(w.media,'') AS media, EXTRACT(EPOCH FROM w.created_at)*1000::bigint AS created_ms, "
        "(SELECT COUNT(*) FROM likes l WHERE l.weibo_id = w.weibo_id) AS like_count, "
        "(SELECT COUNT(*) FROM comments c WHERE c.weibo_id = w.weibo_id) AS comment_count "
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
        item["avatar"] = std::string(PQgetvalue(res, i, 3));
        item["content"] = std::string(PQgetvalue(res, i, 4));
        item["media"] = std::string(PQgetvalue(res, i, 5));
        // created_ms is numeric string
        try { item["created_at"] = std::stoll(PQgetvalue(res, i, 6)); } catch(...) { item["created_at"] = 0; }
        try { item["like_count"] = std::stoi(PQgetvalue(res, i, 7)); } catch(...) { item["like_count"] = 0; }
        try { item["comment_count"] = std::stoi(PQgetvalue(res, i, 8)); } catch(...) { item["comment_count"] = 0; }
        arr.push_back(item);
    }
    PQclear(res);
    nlohmann::json out;
    out["weibos"] = arr;
    json_out = out.dump();
    return true;
}

bool Database::get_comments(long weibo_id, std::string &json_out, std::string &err) {
    std::string s_weibo = std::to_string(weibo_id);
    const char *paramValues[1] = { s_weibo.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT c.comment_id, c.user_id, u.username, COALESCE(u.avatar,'') AS avatar, c.content, COALESCE(c.parent_id,0) AS parent_id, EXTRACT(EPOCH FROM c.created_at)*1000::bigint AS created_ms "
        "FROM comments c JOIN users u ON c.user_id = u.user_id WHERE c.weibo_id = $1::bigint ORDER BY c.created_at ASC;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    json arr = json::array();
    for (int i = 0; i < PQntuples(res); ++i) {
        json it;
        it["comment_id"] = std::stol(PQgetvalue(res,i,0));
        it["user_id"] = std::stol(PQgetvalue(res,i,1));
        it["username"] = std::string(PQgetvalue(res,i,2));
        it["avatar"] = std::string(PQgetvalue(res,i,3));
        it["content"] = std::string(PQgetvalue(res,i,4));
        try{ it["parent_id"] = std::stol(PQgetvalue(res,i,5)); } catch(...) { it["parent_id"] = 0; }
        try { it["created_at"] = std::stoll(PQgetvalue(res,i,6)); } catch(...) { it["created_at"] = 0; }
        arr.push_back(it);
    }
    PQclear(res);
    json out; out["comments"] = arr; json_out = out.dump(); return true;
}

bool Database::create_comment(long user_id, long weibo_id, const std::string &content, long parent_id, long &out_comment_id, std::string &err) {
    std::string s_weibo = std::to_string(weibo_id);
    std::string s_user = std::to_string(user_id);
    std::string s_parent = std::to_string(parent_id);
    const char *paramValues[4] = { s_weibo.c_str(), s_user.c_str(), content.c_str(), s_parent.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO comments(weibo_id,user_id,content,parent_id) VALUES($1::bigint,$2::bigint,$3,NULLIF($4::bigint,0)) RETURNING comment_id;",
        4, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    out_comment_id = std::stol(PQgetvalue(res,0,0)); PQclear(res); return true;
}

bool Database::delete_comment(long user_id, long comment_id, std::string &err) {
    std::string s_comment = std::to_string(comment_id);
    std::string s_user = std::to_string(user_id);
    const char *paramValues[2] = { s_comment.c_str(), s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM comments WHERE comment_id=$1::bigint AND user_id=$2::bigint RETURNING comment_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::update_user_profile(long user_id, const std::string &username, const std::string &avatar, std::string &err) {
    std::string s_user = std::to_string(user_id);
    const char *paramValues[3] = { username.c_str(), avatar.c_str(), s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "UPDATE users SET username=$1, avatar=$2 WHERE user_id=$3::bigint RETURNING user_id;",
        3, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::get_user_likes(long user_id, std::string &json_out, std::string &err) {
    std::string s_user = std::to_string(user_id);
    const char *paramValues[1] = { s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT weibo_id FROM likes WHERE user_id = $1::bigint;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    json arr = json::array();
    for (int i=0;i<PQntuples(res);++i){ arr.push_back(std::stol(PQgetvalue(res,i,0))); }
    PQclear(res);
    json out; out["weibo_ids"] = arr; json_out = out.dump(); return true;
}

bool Database::add_like(long user_id, long weibo_id, long &out_like_id, std::string &err) {
    std::string s_weibo = std::to_string(weibo_id);
    std::string s_user = std::to_string(user_id);
    const char *paramValues[2] = { s_weibo.c_str(), s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO likes(weibo_id,user_id) VALUES($1::bigint,$2::bigint) RETURNING like_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    out_like_id = std::stol(PQgetvalue(res,0,0)); PQclear(res); return true;
}

bool Database::remove_like(long user_id, long weibo_id, std::string &err) {
    std::string s_weibo = std::to_string(weibo_id);
    std::string s_user = std::to_string(user_id);
    const char *paramValues[2] = { s_weibo.c_str(), s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM likes WHERE weibo_id=$1::bigint AND user_id=$2::bigint RETURNING like_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::create_follow(long follower_id, long followee_id, long &out_follow_id, std::string &err) {
    if (follower_id == followee_id) { err = "cannot follow yourself"; return false; }
    std::string s_follower = std::to_string(follower_id);
    std::string s_followee = std::to_string(followee_id);
    const char *paramValues[2] = { s_follower.c_str(), s_followee.c_str() };
    // Try INSERT normally; some Postgres-compatible DBs (e.g. older versions or
    // some forks) may not support ON CONFLICT. If INSERT fails with unique
    // violation, fall back to selecting existing follow_id.
    PGresult *res = PQexecParams(pimpl->conn,
        "INSERT INTO follows(follower_id,followee_id) VALUES($1::bigint,$2::bigint) RETURNING follow_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    ExecStatusType st = PQresultStatus(res);
    if (st == PGRES_TUPLES_OK && PQntuples(res) > 0) {
        out_follow_id = std::stol(PQgetvalue(res,0,0)); PQclear(res); return true;
    }
    // If insert failed, check SQLSTATE for unique violation (23505)
    if (st != PGRES_TUPLES_OK) {
        const char *sqlstate = PQresultErrorField(res, PG_DIAG_SQLSTATE);
        const char *errmsg = PQresultErrorMessage(res);
        PQclear(res);
        if (sqlstate && std::string(sqlstate) == "23505") {
            // duplicate key -> select existing follow_id
            PGresult *res2 = PQexecParams(pimpl->conn,
                "SELECT follow_id FROM follows WHERE follower_id=$1::bigint AND followee_id=$2::bigint;",
                2, nullptr, paramValues, nullptr, nullptr, 0);
            if (!res2) { err = "no result"; return false; }
            if (PQresultStatus(res2) == PGRES_TUPLES_OK && PQntuples(res2) > 0) {
                out_follow_id = std::stol(PQgetvalue(res2,0,0)); PQclear(res2); return true;
            }
            const char *em = PQresultErrorMessage(res2);
            if (em && em[0] != '\0') err = em; else err = "no follow_id found after duplicate";
            PQclear(res2);
            return false;
        }
        // Not a duplicate-key error, return original error message
        if (errmsg && errmsg[0] != '\0') err = errmsg; else err = "insert failed";
        return false;
    }
    // Should not reach here; treat as unexpected failure
    err = "insert failed (unexpected)";
    return false;
}

bool Database::remove_follow(long follower_id, long followee_id, std::string &err) {
    std::string s_follower = std::to_string(follower_id);
    std::string s_followee = std::to_string(followee_id);
    const char *paramValues[2] = { s_follower.c_str(), s_followee.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM follows WHERE follower_id=$1::bigint AND followee_id=$2::bigint RETURNING follow_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    // Treat deleting a non-existent follow as success (idempotent unfollow)
    PQclear(res);
    return true;
}

bool Database::delete_weibo(long user_id, long weibo_id, std::string &err) {
    std::string s_weibo = std::to_string(weibo_id);
    std::string s_user = std::to_string(user_id);
    const char *paramValues[2] = { s_weibo.c_str(), s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "DELETE FROM weibos WHERE weibo_id=$1::bigint AND user_id=$2::bigint RETURNING weibo_id;",
        2, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    bool ok = PQntuples(res) > 0; PQclear(res); return ok;
}

bool Database::get_followers(long user_id, std::string &json_out, std::string &err) {
    std::string s_user = std::to_string(user_id);
    const char *paramValues[1] = { s_user.c_str() };
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
    std::string s_user = std::to_string(user_id);
    const char *paramValues[1] = { s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT u.user_id,u.username FROM follows f JOIN users u ON f.followee_id = u.user_id WHERE f.follower_id = $1::bigint;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    json arr = json::array();
    for (int i=0;i<PQntuples(res);++i){ json it; it["user_id"] = std::stol(PQgetvalue(res,i,0)); it["username"] = std::string(PQgetvalue(res,i,1)); arr.push_back(it);} PQclear(res);
    json out; out["users"] = arr; json_out = out.dump(); return true;
}

bool Database::get_user_info(long user_id, std::string &json_out, std::string &err) {
    std::string s_user = std::to_string(user_id);
    const char *paramValues[1] = { s_user.c_str() };
    PGresult *res = PQexecParams(pimpl->conn,
        "SELECT user_id, username, COALESCE(avatar,'') AS avatar FROM users WHERE user_id = $1::bigint;",
        1, nullptr, paramValues, nullptr, nullptr, 0);
    if (!res) { err = "no result"; return false; }
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { err = PQresultErrorMessage(res); PQclear(res); return false; }
    if (PQntuples(res) == 0) { err = "user not found"; PQclear(res); return false; }
    json out;
    out["user_id"] = std::stol(PQgetvalue(res, 0, 0));
    out["username"] = std::string(PQgetvalue(res, 0, 1));
    out["avatar"] = std::string(PQgetvalue(res, 0, 2));
    PQclear(res);
    json result;
    result["ok"] = true;
    result["data"] = out;
    json_out = result.dump();
    return true;
}

#pragma once

#include <string>
#include <optional>

class Database {
public:
    Database();
    ~Database();
    bool init(const std::string &conninfo, std::string &err);
    bool create_user(const std::string &username, const std::string &email, const std::string &password_hash, long &out_user_id, std::string &err);
    bool check_user(const std::string &email, const std::string &password_hash, long &out_user_id);
    bool create_weibo(long user_id, const std::string &content, const std::string &media, long &out_weibo_id, std::string &err);
    bool get_weibos(int limit, std::string &json_out, std::string &err);
    bool create_comment(long user_id, long weibo_id, const std::string &content, long &out_comment_id, std::string &err);
    bool get_comments(long weibo_id, std::string &json_out, std::string &err);
    bool add_like(long user_id, long weibo_id, long &out_like_id, std::string &err);
    bool remove_like(long user_id, long weibo_id, std::string &err);
    bool get_user_likes(long user_id, std::string &json_out, std::string &err);
    bool create_follow(long follower_id, long followee_id, long &out_follow_id, std::string &err);
    bool remove_follow(long follower_id, long followee_id, std::string &err);
    bool delete_weibo(long user_id, long weibo_id, std::string &err);
    bool get_followers(long user_id, std::string &json_out, std::string &err);
    bool get_following(long user_id, std::string &json_out, std::string &err);

private:
    struct Impl;
    Impl *pimpl = nullptr;
};

#pragma once

#include <string>
#include <ctime>

struct User {
    long user_id;
    std::string username;
    std::string email;
    std::string password_hash;
    std::time_t created_at;
};

struct Weibo {
    long weibo_id;
    long user_id;
    std::string content;
    std::string media;
    std::time_t created_at;
};

struct Comment {
    long comment_id;
    long weibo_id;
    long user_id;
    std::string content;
    std::time_t created_at;
};

struct Like {
    long like_id;
    long weibo_id;
    long user_id;
    std::time_t created_at;
};

struct Follow {
    long follow_id;
    long follower_id;
    long followee_id;
    std::time_t created_at;
};

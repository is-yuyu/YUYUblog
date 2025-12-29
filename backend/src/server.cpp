#include "server.h"
#include "db.h"
#include <httplib.h>
#include <nlohmann/json.hpp>
#include <openssl/sha.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <chrono>
#include <cstdlib>

using json = nlohmann::json;

namespace YUYU {

struct Server::Impl {
    Database db;
    httplib::Server svr;
    std::unordered_map<std::string,long> tokens; // token -> user_id
};

static std::string sha256_hex(const std::string &input) {
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(input.data()), input.size(), hash);
    static const char hex[] = "0123456789abcdef";
    std::string out; out.reserve(SHA256_DIGEST_LENGTH*2);
    for (int i=0;i<SHA256_DIGEST_LENGTH;i++){
        out.push_back(hex[(hash[i]>>4)&0xF]);
        out.push_back(hex[hash[i]&0xF]);
    }
    return out;
}

static std::string gen_token(){
    // simple token: sha256 of time + rand
    auto now = std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
    auto r = std::to_string(rand());
    return sha256_hex(now + ":" + r);
}

long Server::auth_user(const httplib::Request &req) const {
    // Authorization: Bearer <token>
    if (req.has_header("Authorization")){
        auto v = req.get_header_value("Authorization");
        const std::string pref = "Bearer ";
        if (v.rfind(pref,0)==0){
            auto t = v.substr(pref.size());
            auto it = pimpl->tokens.find(t);
            if (it!=pimpl->tokens.end()) return it->second;
        }
    }
    // fallback: allow user_id in body/query (legacy)
    if (req.has_param("user_id")){
        try{ return std::stol(req.get_param_value("user_id")); } catch(...){}
    }
    return 0;
}

Server::Server() : pimpl(new Impl()) {}
Server::~Server(){ if(pimpl) delete pimpl; }

bool Server::init(const std::string &conninfo) {
    std::string err;
    if (!pimpl->db.init(conninfo, err)) {
        std::cerr << "DB init error: " << err << std::endl;
        return false;
    }

    auto &s = pimpl->svr;

    s.Post("/api/register", [this](const httplib::Request &req, httplib::Response &res){
        try {
            auto j = json::parse(req.body);
            std::string username = j.value("username", "");
            std::string email = j.value("email", "");
            std::string password = j.value("password", "");
            if(username.empty()||email.empty()||password.empty()){
                res.status = 400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return;
            }
            std::string pass_hash = sha256_hex(password);
            long user_id=0; std::string err;
            if (!pimpl->db.create_user(username,email,pass_hash,user_id,err)){
                res.status = 500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return;
            }
            auto token = gen_token();
            pimpl->tokens[token] = user_id;
            res.set_content(json({{"ok",true},{"user_id",user_id},{"token",token}}).dump(),"application/json");
        } catch(...) { res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Post("/api/login", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            std::string email = j.value("email","");
            std::string password = j.value("password","");
            if(email.empty()||password.empty()){ res.status=400; res.set_content(R"({"ok":false})","application/json"); return; }
            std::string pass_hash = sha256_hex(password);
            long user_id=0;
            if (!pimpl->db.check_user(email,pass_hash,user_id)){
                res.status=401; res.set_content(R"({"ok":false,"error":"invalid credentials"})","application/json"); return;
            }
            auto token = gen_token();
            pimpl->tokens[token] = user_id;
            res.set_content(json({{"ok",true},{"user_id",user_id},{"token",token}}).dump(),"application/json");
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Post("/api/weibo", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = j.value("user_id", 0);
            std::string content = j.value("content", "");
            std::string media = j.value("media", "");
            if(user_id<=0||content.empty()){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            long weibo_id=0; std::string err;
            if(!pimpl->db.create_weibo(user_id,content,media,weibo_id,err)){
                res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return;
            }
            res.set_content(json({{"ok",true},{"weibo_id",weibo_id}}).dump(),"application/json");
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Post("/api/comment", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = auth_user(req);
            if(user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
            long weibo_id = j.value("weibo_id", 0);
            std::string content = j.value("content", "");
            long parent_id = j.value("parent_id", 0);
            if(weibo_id<=0 || content.empty()){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            long comment_id=0; std::string err;
            if(!pimpl->db.create_comment(user_id,weibo_id,content,parent_id,comment_id,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
            res.set_content(json({{"ok",true},{"comment_id",comment_id}}).dump(),"application/json");
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    // delete comment (only author)
    s.Post("/api/comment/delete", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = auth_user(req);
            if(user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
            long comment_id = j.value("comment_id", 0);
            if(comment_id<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            std::string err;
            if(!pimpl->db.delete_comment(user_id, comment_id, err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
            res.set_content(json({{"ok",true}}).dump(),"application/json");
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    // update user profile (username, avatar)
    s.Post("/api/user/update", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = auth_user(req);
            if(user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
            std::string username = j.value("username", "");
            std::string avatar = j.value("avatar", "");
            if(username.empty() && avatar.empty()){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            std::string err;
            if(!pimpl->db.update_user_profile(user_id, username, avatar, err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
            res.set_content(json({{"ok",true}}).dump(),"application/json");
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Post("/api/like", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = auth_user(req);
            if(user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
            long weibo_id = j.value("weibo_id",0);
            std::string action = j.value("action","like");
            if(weibo_id<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            std::string err; long id=0;
            if(action=="like"){
                if(!pimpl->db.add_like(user_id,weibo_id,id,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
                res.set_content(json({{"ok",true},{"like_id",id}}).dump(),"application/json");
            } else {
                if(!pimpl->db.remove_like(user_id,weibo_id,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
                res.set_content(json({{"ok",true}}).dump(),"application/json");
            }
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Post("/api/follow", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = auth_user(req);
            if(user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
            long followee = j.value("followee_id",0);
            std::string action = j.value("action","follow");
            if(followee<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            std::string err; long id=0;
            if(action=="follow"){
                if(!pimpl->db.create_follow(user_id,followee,id,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
                res.set_content(json({{"ok",true},{"follow_id",id}}).dump(),"application/json");
            } else {
                if(!pimpl->db.remove_follow(user_id,followee,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
                res.set_content(json({{"ok",true}}).dump(),"application/json");
            }
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Post("/api/weibo/delete", [this](const httplib::Request &req, httplib::Response &res){
        try{
            auto j = json::parse(req.body);
            long user_id = auth_user(req);
            if(user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
            long weibo_id = j.value("weibo_id",0);
            if(weibo_id<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid input"})","application/json"); return; }
            std::string err;
            if(!pimpl->db.delete_weibo(user_id,weibo_id,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
            res.set_content(json({{"ok",true}}).dump(),"application/json");
        }catch(...){ res.status=400; res.set_content(R"({"ok":false})","application/json"); }
    });

    s.Get("/api/followers", [this](const httplib::Request &req, httplib::Response &res){
        long user_id = 0;
        if (req.has_param("user_id")) try{ user_id = std::stol(req.get_param_value("user_id")); } catch(...){}
        if(user_id<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid user_id"})","application/json"); return; }
        std::string out, err;
        if(!pimpl->db.get_followers(user_id,out,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
        res.set_content(out, "application/json");
    });

    s.Get("/api/comments", [this](const httplib::Request &req, httplib::Response &res){
        long weibo_id = 0;
        if (req.has_param("weibo_id")) try{ weibo_id = std::stol(req.get_param_value("weibo_id")); } catch(...){}
        if (weibo_id<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid weibo_id"})","application/json"); return; }
        std::string out, err;
        if(!pimpl->db.get_comments(weibo_id,out,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
        res.set_content(out, "application/json");
    });

    s.Get("/api/user_likes", [this](const httplib::Request &req, httplib::Response &res){
        long user_id = auth_user(req);
        if (user_id<=0){ res.status=401; res.set_content(R"({"ok":false,"error":"unauthorized"})","application/json"); return; }
        std::string out, err;
        if(!pimpl->db.get_user_likes(user_id,out,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
        res.set_content(out, "application/json");
    });

    s.Get("/api/following", [this](const httplib::Request &req, httplib::Response &res){
        long user_id = 0;
        if (req.has_param("user_id")) try{ user_id = std::stol(req.get_param_value("user_id")); } catch(...){}
        if(user_id<=0){ res.status=400; res.set_content(R"({"ok":false,"error":"invalid user_id"})","application/json"); return; }
        std::string out, err;
        if(!pimpl->db.get_following(user_id,out,err)){ res.status=500; res.set_content(json({{"ok",false},{"error",err}}).dump(),"application/json"); return; }
        res.set_content(out, "application/json");
    });

    s.Get("/api/weibos", [this](const httplib::Request &req, httplib::Response &res){
        int limit = 50;
        if (req.has_param("limit")) {
            try { limit = std::stoi(req.get_param_value("limit")); }
            catch(...) { limit = 50; }
        }
        std::string json_out, err;
        if (!pimpl->db.get_weibos(limit, json_out, err)) {
            res.status = 500;
            res.set_content(json({{"ok",false},{"error",err}}).dump(), "application/json");
            return;
        }
        res.set_content(json_out, "application/json");
    });

    // Try to serve frontend static files. Try several relative paths so that
    // it works whether the executable is run from build dir or project root.
    const char *candidates[] = {"frontend", "./frontend", "../frontend", "../../frontend"};
    for (auto &p : candidates) {
        s.set_mount_point("/", p);
    }

    // Fallback: explicitly serve index.html on root if mount points didn't match
    s.Get("/", [](const httplib::Request &req, httplib::Response &res){
        const char *cands[] = {"frontend/index.html", "./frontend/index.html", "../frontend/index.html", "../../frontend/index.html"};
        for (auto &fp : cands) {
            std::ifstream ifs(fp, std::ios::binary);
            if (ifs) {
                std::stringstream ss; ss << ifs.rdbuf();
                res.set_content(ss.str(), "text/html");
                return;
            }
        }
        res.status = 404;
        res.set_content("Not Found", "text/plain");
    });

    return true;
}

void Server::run(int port) {
    std::cout << "Starting YUYU server on port " << port << "\n";
    pimpl->svr.listen("0.0.0.0", port);
}

} // namespace YUYU
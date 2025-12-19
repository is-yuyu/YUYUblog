#pragma once

#include <string>
#include <httplib.h>

namespace YUYU {
  class Server {
  public:
    Server();
    ~Server();
    bool init(const std::string &conninfo);
    void run(int port);
    long auth_user(const httplib::Request &req) const;
  private:
    struct Impl;
    Impl *pimpl = nullptr;
  };
}
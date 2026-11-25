#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_STORE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_STORE_H_

#include <map>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback_forward.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"

namespace rail {

struct ChannelEntry {
  std::string channel_id;
  std::string app_id;
  std::string authorized_entity;
  std::string endpoint;
};

class RailPushStore {
 public:
  using LoadCallback = base::OnceClosure;

  RailPushStore(base::FilePath path,
                scoped_refptr<base::SequencedTaskRunner> runner);
  ~RailPushStore();

  RailPushStore(const RailPushStore&) = delete;
  RailPushStore& operator=(const RailPushStore&) = delete;

  void Load(LoadCallback callback);

  std::string GetUaid() const { return uaid_; }
  void SetUaid(std::string uaid);

  std::vector<std::string> AllChannelIds() const;
  const ChannelEntry* FindChannel(std::string_view app_id,
                                  std::string_view entity) const;
  const ChannelEntry* FindChannelById(std::string_view channel_id) const;
  void AddChannel(ChannelEntry entry);
  std::vector<std::string> RemoveChannels(std::string_view app_id,
                                          std::string_view entity);

  std::pair<std::string, std::string> GetInstanceIDData(
      std::string_view app_id) const;
  void SetInstanceIDData(std::string_view app_id,
                         std::string id,
                         std::string extra);
  void RemoveInstanceIDData(std::string_view app_id);

  void Save();

 private:
  void OnLoaded(std::string json);
  void ParseJson(const std::string& json);
  std::string Serialize() const;

  base::FilePath path_;
  scoped_refptr<base::SequencedTaskRunner> runner_;

  std::string uaid_;
  std::vector<ChannelEntry> channels_;
  std::map<std::string, std::pair<std::string, std::string>> instance_ids_;

  LoadCallback load_callback_;
  base::WeakPtrFactory<RailPushStore> weak_factory_{this};
};

}

#endif

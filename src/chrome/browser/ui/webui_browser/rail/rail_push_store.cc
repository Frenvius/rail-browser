#include "chrome/browser/ui/webui_browser/rail/rail_push_store.h"

#include <algorithm>
#include <utility>

#include "base/base64url.h"
#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/string_util.h"
#include "base/task/sequenced_task_runner.h"
#include "base/values.h"

namespace rail {

RailPushStore::RailPushStore(base::FilePath path,
                              scoped_refptr<base::SequencedTaskRunner> runner)
    : path_(std::move(path)), runner_(std::move(runner)) {}

RailPushStore::~RailPushStore() = default;

void RailPushStore::Load(LoadCallback callback) {
  load_callback_ = std::move(callback);
  base::FilePath path = path_;
  runner_->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(
          [](base::FilePath p) -> std::string {
            std::string content;
            base::ReadFileToString(p, &content);
            return content;
          },
          path),
      base::BindOnce(&RailPushStore::OnLoaded, weak_factory_.GetWeakPtr()));
}

void RailPushStore::SetUaid(std::string uaid) {
  uaid_ = std::move(uaid);
}

std::vector<std::string> RailPushStore::AllChannelIds() const {
  std::vector<std::string> ids;
  ids.reserve(channels_.size());
  for (const auto& ch : channels_) {
    ids.push_back(ch.channel_id);
  }
  return ids;
}

const ChannelEntry* RailPushStore::FindChannel(std::string_view app_id,
                                                std::string_view entity) const {
  for (const auto& ch : channels_) {
    if (ch.app_id == app_id && ch.authorized_entity == entity) {
      return &ch;
    }
  }
  return nullptr;
}

const ChannelEntry* RailPushStore::FindChannelById(
    std::string_view channel_id) const {
  for (const auto& ch : channels_) {
    if (base::EqualsCaseInsensitiveASCII(ch.channel_id, channel_id)) {
      return &ch;
    }
  }
  return nullptr;
}

void RailPushStore::AddChannel(ChannelEntry entry) {
  for (auto& ch : channels_) {
    if (ch.app_id == entry.app_id &&
        ch.authorized_entity == entry.authorized_entity) {
      ch = std::move(entry);
      return;
    }
  }
  channels_.push_back(std::move(entry));
}

std::vector<std::string> RailPushStore::RemoveChannels(
    std::string_view app_id, std::string_view entity) {
  std::vector<std::string> removed;
  channels_.erase(
      std::remove_if(channels_.begin(), channels_.end(),
                     [&](const ChannelEntry& ch) {
                       bool match = ch.app_id == app_id &&
                                    (entity == "*" ||
                                     ch.authorized_entity == entity);
                       if (match) {
                         removed.push_back(ch.channel_id);
                       }
                       return match;
                     }),
      channels_.end());
  return removed;
}

std::pair<std::string, std::string> RailPushStore::GetInstanceIDData(
    std::string_view app_id) const {
  auto it = instance_ids_.find(std::string(app_id));
  if (it == instance_ids_.end()) {
    return {};
  }
  return it->second;
}

void RailPushStore::SetInstanceIDData(std::string_view app_id,
                                       std::string id,
                                       std::string extra) {
  instance_ids_[std::string(app_id)] = {std::move(id), std::move(extra)};
}

void RailPushStore::RemoveInstanceIDData(std::string_view app_id) {
  instance_ids_.erase(std::string(app_id));
}

void RailPushStore::Save() {
  base::FilePath path = path_;
  std::string content = Serialize();
  runner_->PostTask(
      FROM_HERE,
      base::BindOnce(
          [](base::FilePath p, std::string c) {
            base::CreateDirectory(p.DirName());
            base::ImportantFileWriter::WriteFileAtomically(p, c);
          },
          path, std::move(content)));
}

void RailPushStore::OnLoaded(std::string json) {
  if (!json.empty()) {
    ParseJson(json);
  }
  if (load_callback_) {
    std::move(load_callback_).Run();
  }
}

void RailPushStore::ParseJson(const std::string& json) {
  auto value = base::JSONReader::ReadDict(json, 0);
  if (!value) {
    return;
  }
  if (const std::string* uaid = value->FindString("uaid")) {
    uaid_ = *uaid;
  }
  if (const base::ListValue* channels = value->FindList("channels")) {
    for (const auto& item : *channels) {
      const base::DictValue* d = item.GetIfDict();
      if (!d) {
        continue;
      }
      const std::string* channel_id = d->FindString("channel_id");
      const std::string* app_id = d->FindString("app_id");
      const std::string* entity = d->FindString("authorized_entity");
      const std::string* endpoint = d->FindString("endpoint");
      if (!channel_id || !app_id || !entity || !endpoint) {
        continue;
      }
      channels_.push_back({*channel_id, *app_id, *entity, *endpoint});
    }
  }
  if (const base::DictValue* ids = value->FindDict("instance_ids")) {
    for (const auto& [key, val] : *ids) {
      const base::DictValue* d = val.GetIfDict();
      if (!d) {
        continue;
      }
      const std::string* id = d->FindString("id");
      const std::string* extra = d->FindString("extra");
      if (!id || !extra) {
        continue;
      }
      instance_ids_[key] = {*id, *extra};
    }
  }
}

std::string RailPushStore::Serialize() const {
  base::DictValue root;
  root.Set("uaid", uaid_);

  base::ListValue channels_list;
  for (const auto& ch : channels_) {
    base::DictValue d;
    d.Set("channel_id", ch.channel_id);
    d.Set("app_id", ch.app_id);
    d.Set("authorized_entity", ch.authorized_entity);
    d.Set("endpoint", ch.endpoint);
    channels_list.Append(std::move(d));
  }
  root.Set("channels", std::move(channels_list));

  base::DictValue ids_dict;
  for (const auto& [key, val] : instance_ids_) {
    base::DictValue d;
    d.Set("id", val.first);
    d.Set("extra", val.second);
    ids_dict.Set(key, std::move(d));
  }
  root.Set("instance_ids", std::move(ids_dict));

  return base::WriteJson(root).value_or("{}");
}

}

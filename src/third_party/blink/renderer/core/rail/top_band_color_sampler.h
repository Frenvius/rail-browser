#ifndef THIRD_PARTY_BLINK_RENDERER_CORE_RAIL_TOP_BAND_COLOR_SAMPLER_H_
#define THIRD_PARTY_BLINK_RENDERER_CORE_RAIL_TOP_BAND_COLOR_SAMPLER_H_

#include <algorithm>
#include <array>
#include <cmath>
#include <optional>

#include "third_party/skia/include/core/SkBitmap.h"
#include "third_party/skia/include/core/SkColor.h"

namespace rail {

constexpr int kSampleBandHeight = 8;
constexpr int kSampleRightInset = 24;
constexpr int kSampleColumns = 5;
constexpr float kMaxBandVariation = 0.5f;

inline float ColorDistance(SkColor a, SkColor b) {
  float red = (static_cast<float>(SkColorGetR(a)) - SkColorGetR(b)) / 255;
  float green = (static_cast<float>(SkColorGetG(a)) - SkColorGetG(b)) / 255;
  float blue = (static_cast<float>(SkColorGetB(a)) - SkColorGetB(b)) / 255;
  return std::sqrt(red * red + green * green + blue * blue);
}

inline std::optional<SkColor> FlatBandColor(
    const SkBitmap& bitmap,
    int band_height = kSampleBandHeight,
    int right_inset = kSampleRightInset) {
  int width = bitmap.width();
  int height = std::min(bitmap.height(), band_height);
  if (width <= 0 || height <= 0) {
    return std::nullopt;
  }
  int span = std::max(width - right_inset, 0);
  std::array<SkColor, kSampleColumns> top;
  std::array<SkColor, kSampleColumns> bottom;
  for (int i = 0; i < kSampleColumns; ++i) {
    int x = std::clamp(static_cast<int>(i * 0.25f * span), 0, width - 1);
    top[i] = bitmap.getColor(x, 0);
    bottom[i] = bitmap.getColor(x, height - 1);
  }
  float variation = std::max(ColorDistance(top[0], bottom[0]),
                             ColorDistance(top[4], bottom[4]));
  for (int i = 0; i < kSampleColumns; ++i) {
    for (int j = i + 1; j < kSampleColumns; ++j) {
      variation = std::max(variation, ColorDistance(top[i], top[j]));
    }
  }
  if (variation == 0) {
    return top[0];
  }
  if (variation > kMaxBandVariation) {
    return std::nullopt;
  }
  int alpha = 0;
  int red = 0;
  int green = 0;
  int blue = 0;
  for (SkColor color : top) {
    alpha += SkColorGetA(color);
    red += SkColorGetR(color);
    green += SkColorGetG(color);
    blue += SkColorGetB(color);
  }
  auto mean = [](int sum) {
    return static_cast<U8CPU>(
        std::lround(static_cast<float>(sum) / kSampleColumns));
  };
  return SkColorSetARGB(mean(alpha), mean(red), mean(green), mean(blue));
}

}

#endif

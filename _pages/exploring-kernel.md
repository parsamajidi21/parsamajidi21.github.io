---
layout: page
title: Exploring Kernel
permalink: /exploring-kernel/
description: A journey through Linux kernel device driver development — from modules to DMA.
nav: true
nav_order: 5
---

<div class="post">
  <div class="header-bar">
    <h1>Exploring Kernel Device Drivers</h1>
    <p>A day-by-day journey into Linux kernel driver development</p>
  </div>

  <ol class="post-list">
    {% assign kernel_posts = site.posts | where_exp: "post", "post.categories contains 'exploring-kernel'" | sort: "date" %}
    {% for post in kernel_posts %}
    <li>
      <h3>
        <a class="post-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
      </h3>
      <p>{{ post.description }}</p>
      <p class="post-meta">
        {{ post.date | date: '%B %d, %Y' }}
      </p>
    </li>
    {% endfor %}
  </ol>

  {% if kernel_posts.size == 0 %}
  <p>Coming soon...</p>
  {% endif %}
</div>

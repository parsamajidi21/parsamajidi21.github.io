---
layout: page
title: Exploring Rust
permalink: /exploring-rust/
description: A journey through the Rust programming language — from ownership to async.
nav: true
nav_order: 4
---

<div class="post">
  <div class="header-bar">
    <h1>Exploring Rust</h1>
    <p>A day-by-day journey into Rust programming</p>
  </div>

  <ol class="post-list">
    {% assign rust_posts = site.posts | where_exp: "post", "post.categories contains 'exploring-rust'" | sort: "date" %}
    {% for post in rust_posts %}
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

  {% if rust_posts.size == 0 %}
  <p>Coming soon...</p>
  {% endif %}
</div>

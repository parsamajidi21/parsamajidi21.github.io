---
layout: page
title: Exploring Protocols
permalink: /exploring-protocols/
description: A journey through communication protocols — from UART and SPI to I2C and beyond.
nav: false
nav_order: 7
---

<div class="post">
  <div class="header-bar">
    <h1>Exploring Communication Protocols</h1>
    <p>A day-by-day journey into serial and communication protocols</p>
  </div>

  <ol class="post-list">
    {% assign protocol_posts = site.posts | where_exp: "post", "post.categories contains 'exploring-protocols'" | sort: "date" %}
    {% for post in protocol_posts %}
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

  {% if protocol_posts.size == 0 %}
  <p>Coming soon...</p>
  {% endif %}
</div>
